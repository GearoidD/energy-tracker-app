"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// iPhones default to saving camera photos as HEIC, which Claude's vision API
// doesn't support — convert to JPEG in the browser before it's ever sent.
async function convertHeicIfNeeded(file) {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.heic$/i.test(file.name) ||
    /\.heif$/i.test(file.name);
  if (!isHeic) return file;

  const heic2any = (await import("heic2any")).default;
  const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
  return new File([finalBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
}

// Modern phone photos can be several MB even after HEIC conversion — resize
// and re-compress so the request never exceeds the hosting platform's size limit.
async function compressImage(file, maxDimension = 2000, quality = 0.82) {
  if (file.type === "application/pdf") return file; // PDFs pass through untouched
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Couldn't process this image"));
            return;
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this image file"));
    };
    img.src = url;
  });
}

// accountId: an existing account's id, or null if this bill might be for a new site
export default function UploadReading({ accountId, companyId, accounts = [], onDone, onCancel }) {
  const [stage, setStage] = useState("pick"); // pick, extracting, confirm, saving
  const [error, setError] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [targetMode, setTargetMode] = useState(accountId ? "existing" : "choose"); // choose, existing, new
  const [selectedAccountId, setSelectedAccountId] = useState(accountId || "");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAccountNumber, setNewSiteAccountNumber] = useState("");
  const [newSiteFuelType, setNewSiteFuelType] = useState("electricity");
  const [contractEndValue, setContractEndValue] = useState("");
  const [syncContractEnd, setSyncContractEnd] = useState(true);
  const [capacityValue, setCapacityValue] = useState("");
  const [syncCapacity, setSyncCapacity] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [multiPageMode, setMultiPageMode] = useState(false);
  const [multiPageFiles, setMultiPageFiles] = useState([]);
  const [fuelTypeUncertain, setFuelTypeUncertain] = useState(false);
  const [rateCarriedOver, setRateCarriedOver] = useState(false);
  const [dgGroupValue, setDgGroupValue] = useState("");
  const [syncDgGroup, setSyncDgGroup] = useState(true);

  // Batch upload state — lets someone pick or drop several bills at once
  const [fileQueue, setFileQueue] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [touchedAccountIds, setTouchedAccountIds] = useState([]);

  const fileInputRef = useRef(null);

  const resetPerBillState = () => {
    setExtracted(null);
    setTargetMode(accountId ? "existing" : "choose");
    setSelectedAccountId(accountId || "");
    setNewSiteName("");
    setNewSiteAccountNumber("");
    setNewSiteFuelType("electricity");
    setContractEndValue("");
    setSyncContractEnd(true);
    setCapacityValue("");
    setSyncCapacity(true);
    setError(null);
    setFuelTypeUncertain(false);
    setRateCarriedOver(false);
    setDgGroupValue("");
    setMultiPageFiles([]);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setStage("extracting");
    try {
      const heicConverted = await convertHeicIfNeeded(file);
      const convertedFile = await compressImage(heicConverted);
      const base64 = await fileToBase64(convertedFile);
      const res = await fetch("/api/extract-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType: convertedFile.type }),
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(
          res.status === 413
            ? "This photo is too large to upload — try again, it should compress automatically now."
            : "Something went wrong reading this file — try again or use a different photo."
        );
      }
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      const extractedData = { ...data.extracted };
      const uncertainFuel = extractedData.fuel_type !== "gas" && extractedData.fuel_type !== "electricity";
      setFuelTypeUncertain(uncertainFuel);

      let targetAccountId = accountId || null;

      if (!accountId) {
        const matched = extractedData.account_number
          ? accounts.find((a) => a.account_number && a.account_number === extractedData.account_number)
          : null;

        if (matched) {
          setTargetMode("existing");
          setSelectedAccountId(matched.id);
          targetAccountId = matched.id;
        } else {
          setTargetMode("new");
          setNewSiteName(extractedData.supply_address || (extractedData.provider ? `${extractedData.provider} account` : ""));
          setNewSiteAccountNumber(extractedData.account_number || "");
          setNewSiteFuelType(extractedData.fuel_type === "gas" ? "gas" : "electricity");
        }
      }

      // If the bill didn't show a rate but this account has prior bill history,
      // assume the rate hasn't changed rather than leaving it blank.
      let carriedOverRate = false;
      if ((extractedData.rate === null || extractedData.rate === undefined) && targetAccountId) {
        const supabaseCheck = createClient();
        const { data: prevReadings } = await supabaseCheck
          .from("readings")
          .select("rate, reading_date")
          .eq("account_id", targetAccountId)
          .not("rate", "is", null)
          .order("reading_date", { ascending: false })
          .limit(1);
        if (prevReadings && prevReadings.length > 0) {
          extractedData.rate = prevReadings[0].rate;
          carriedOverRate = true;
        }
      }
      setRateCarriedOver(carriedOverRate);
      setExtracted(extractedData);
      setContractEndValue(extractedData.contract_end || "");
      setCapacityValue(extractedData.fuel_type === "gas" ? extractedData.spc_kwh || "" : extractedData.mic_kva || "");
      setDgGroupValue(extractedData.dg_group || "");
      setStage("confirm");
    } catch (e) {
      setError(e.message);
      setStage("pick");
    }
  };

  // Kicks off processing for one or more files, whether picked or dropped
  const handleMultiPageFile = async (files) => {
    if (!files || files.length === 0) return;
    setError(null);
    setStage("extracting");
    try {
      const pages = [];
      for (const file of files) {
        const heicConverted = await convertHeicIfNeeded(file);
        const compressed = await compressImage(heicConverted);
        const base64 = await fileToBase64(compressed);
        pages.push({ base64, mediaType: compressed.type });
      }

      const res = await fetch("/api/extract-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(
          res.status === 413
            ? "These photos are too large together — try fewer pages or lower resolution."
            : "Something went wrong reading these files — try again."
        );
      }
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      const extractedData = { ...data.extracted };
      const uncertainFuel = extractedData.fuel_type !== "gas" && extractedData.fuel_type !== "electricity";
      setFuelTypeUncertain(uncertainFuel);

      let targetAccountId = accountId || null;

      if (!accountId) {
        const matched = extractedData.account_number
          ? accounts.find((a) => a.account_number && a.account_number === extractedData.account_number)
          : null;

        if (matched) {
          setTargetMode("existing");
          setSelectedAccountId(matched.id);
          targetAccountId = matched.id;
        } else {
          setTargetMode("new");
          setNewSiteName(extractedData.supply_address || (extractedData.provider ? `${extractedData.provider} account` : ""));
          setNewSiteAccountNumber(extractedData.account_number || "");
          setNewSiteFuelType(extractedData.fuel_type === "gas" ? "gas" : "electricity");
        }
      }

      let carriedOverRate = false;
      if ((extractedData.rate === null || extractedData.rate === undefined) && targetAccountId) {
        const supabaseCheck = createClient();
        const { data: prevReadings } = await supabaseCheck
          .from("readings")
          .select("rate, reading_date")
          .eq("account_id", targetAccountId)
          .not("rate", "is", null)
          .order("reading_date", { ascending: false })
          .limit(1);
        if (prevReadings && prevReadings.length > 0) {
          extractedData.rate = prevReadings[0].rate;
          carriedOverRate = true;
        }
      }
      setRateCarriedOver(carriedOverRate);
      setExtracted(extractedData);
      setContractEndValue(extractedData.contract_end || "");
      setCapacityValue(extractedData.fuel_type === "gas" ? extractedData.spc_kwh || "" : extractedData.mic_kva || "");
      setDgGroupValue(extractedData.dg_group || "");
      setStage("confirm");
    } catch (e) {
      setError(e.message);
      setStage("pick");
    }
  };

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (multiPageMode) {
      setMultiPageFiles((prev) => [...prev, ...files]);
      return;
    }
    setBatchTotal(files.length);
    setBatchIndex(1);
    setFileQueue(files.slice(1));
    setTouchedAccountIds([]);
    handleFile(files[0]);
  };

  const advanceToNextInQueue = () => {
    if (fileQueue.length === 0) return false;
    const [next, ...rest] = fileQueue;
    setFileQueue(rest);
    setBatchIndex((i) => i + 1);
    resetPerBillState();
    handleFile(next);
    return true;
  };

  const set = (k) => (e) => setExtracted((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setError(null);
    const supabase = createClient();
    let finalAccountId = selectedAccountId;

    if (targetMode === "new") {
      if (!newSiteName.trim()) {
        alert("Give this site a name first.");
        return;
      }
      if (!newSiteAccountNumber.trim()) {
        alert("MPRN/GPRN is required — check the bill or enter it manually.");
        return;
      }
      setStage("saving");
      const { data: newAccount, error: accError } = await supabase
        .from("accounts")
        .insert({
          company_id: companyId,
          name: newSiteName,
          provider: extracted.provider || null,
          account_number: newSiteAccountNumber,
          fuel_type: newSiteFuelType,
          rate: extracted.rate || null,
          standing_charge: extracted.standing_charge || null,
          usage: extracted.usage || null,
          contract_end: syncContractEnd && contractEndValue ? contractEndValue : null,
          mic_kva: newSiteFuelType !== "gas" && capacityValue ? capacityValue : null,
          spc_kwh: newSiteFuelType === "gas" && capacityValue ? capacityValue : null,
          dg_group: newSiteFuelType !== "gas" && dgGroupValue ? dgGroupValue : null,
        })
        .select()
        .single();
      if (accError) {
        const isDuplicate = accError.code === "23505" || (accError.message || "").includes("accounts_company_account_number_unique");
        if (isDuplicate) {
          alert("That MPRN/GPRN is already used by another account — pick it from the dropdown instead of creating a new one.");
        } else {
          setError(accError.message);
        }
        setStage("confirm");
        return;
      }
      finalAccountId = newAccount.id;
    } else {
      if (!finalAccountId) {
        alert("Choose which account this bill belongs to.");
        return;
      }
      setStage("saving");
      if (syncContractEnd && contractEndValue) {
        await supabase.from("accounts").update({ contract_end: contractEndValue }).eq("id", finalAccountId);
      }
      if (syncCapacity && capacityValue) {
        const matchedAccount = accounts.find((a) => a.id === finalAccountId);
        const field = matchedAccount?.fuel_type === "gas" ? "spc_kwh" : "mic_kva";
        await supabase.from("accounts").update({ [field]: capacityValue }).eq("id", finalAccountId);
      }
      if (syncDgGroup && dgGroupValue) {
        await supabase.from("accounts").update({ dg_group: dgGroupValue }).eq("id", finalAccountId);
      }
    }

    const { error: readingError } = await supabase.from("readings").insert({
      account_id: finalAccountId,
      company_id: companyId,
      reading_date: extracted.reading_date || null,
      usage: extracted.usage || null,
      rate: extracted.rate || null,
      standing_charge: extracted.standing_charge || null,
      total_cost: extracted.total_cost || null,
      source: "upload",
      confidence: extracted.confidence || null,
    });

    if (readingError) {
      const isDuplicate = readingError.code === "23505" || (readingError.message || "").includes("readings_account_date_unique");
      if (isDuplicate) {
        alert("A reading for this account on this date has already been saved — this bill may already be in the system.");
      } else {
        setError(readingError.message);
      }
      setStage("confirm");
      return;
    }

    const nextTouched = [...touchedAccountIds, finalAccountId];
    setTouchedAccountIds(nextTouched);

    if (fileQueue.length > 0) {
      advanceToNextInQueue();
    } else {
      onDone(nextTouched);
    }
  };

  const openPicker = () => fileInputRef.current?.click();

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (stage === "pick") handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}
      onClick={onCancel}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 460, maxWidth: "100%", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
            Upload a bill
          </h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {batchTotal > 1 && (stage === "extracting" || stage === "confirm" || stage === "saving") && (
          <div style={{ fontSize: 12, color: "var(--teal)", marginBottom: 12, fontWeight: 600 }}>
            Bill {batchIndex} of {batchTotal}
          </div>
        )}

        {stage === "pick" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Upload one or more bill photos or PDFs — drag them in, or tap to choose. On your phone, this can open the camera directly.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: "none" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text)", cursor: "pointer", marginBottom: 12 }}>
              <input type="checkbox" checked={multiPageMode} onChange={(e) => setMultiPageMode(e.target.checked)} />
              This bill spans multiple photos (e.g. front + back) — combine them into one bill
            </label>
            <button
              onClick={openPicker}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{
                width: "100%",
                border: `1px dashed ${isDragOver ? "var(--teal)" : "var(--border-light)"}`,
                borderRadius: 10,
                padding: "32px 20px",
                background: isDragOver ? "var(--bg)" : "none",
                color: "var(--muted)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Upload size={22} color="var(--teal)" />
              <span style={{ fontSize: 13 }}>
                {isDragOver ? "Drop to upload" : multiPageMode ? "Tap to take or choose a photo" : "Drag files here, or tap to choose"}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {multiPageMode ? "Add each page one at a time — camera only captures one photo per tap" : "You can select several at once"}
              </span>
            </button>

            {multiPageMode && multiPageFiles.length > 0 && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 12.5, color: "var(--text)", marginBottom: 8, fontWeight: 600 }}>
                  {multiPageFiles.length} page{multiPageFiles.length === 1 ? "" : "s"} added
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {multiPageFiles.map((f, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
                      <span>Page {i + 1}: {f.name}</span>
                      <button
                        onClick={() => setMultiPageFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11, padding: 0 }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleMultiPageFile(multiPageFiles)}
                    style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12.5 }}
                  >
                    Done — read {multiPageFiles.length} page{multiPageFiles.length === 1 ? "" : "s"} as one bill
                  </button>
                  <button
                    onClick={() => setMultiPageFiles([])}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12.5 }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--red)", fontSize: 13, marginTop: 12 }}>
                <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                {error}
              </div>
            )}
          </div>
        )}

        {stage === "extracting" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "30px 0", color: "var(--muted)" }}>
            <Loader2 size={22} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Reading the bill…</span>
          </div>
        )}

        {stage === "confirm" && extracted && (
          <div>
            {extracted.confidence === "low" && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--amber)", fontSize: 12.5, marginBottom: 14, background: "var(--bg)", padding: "8px 10px", borderRadius: 6 }}>
                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                Some of this was hard to read clearly — double-check the numbers below before saving.
              </div>
            )}
            {rateCarriedOver && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--teal)", fontSize: 12.5, marginBottom: 14, background: "var(--bg)", padding: "8px 10px", borderRadius: 6 }}>
                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                This bill didn't show a rate — carried over from the previous bill. Adjust it if it's actually changed.
              </div>
            )}
            {extracted.rate_note && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--amber)", fontSize: 12.5, marginBottom: 14, background: "var(--bg)", padding: "8px 10px", borderRadius: 6 }}>
                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                This bill has more than one rate: {extracted.rate_note}. The single rate below is simplified — adjust it if needed.
              </div>
            )}

            {!accountId && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                {targetMode === "existing" && selectedAccountId && extracted.account_number && (
                  <div style={{ fontSize: 12.5, color: "var(--teal)", marginBottom: 10 }}>
                    Matched to <strong>{accounts.find((a) => a.id === selectedAccountId)?.name}</strong> by MPRN/GPRN — change below if that's wrong.
                  </div>
                )}
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  Which account is this for?
                  <select
                    style={inputStyle}
                    value={targetMode === "new" ? "__new__" : selectedAccountId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setTargetMode("new");
                        setSelectedAccountId("");
                      } else {
                        setTargetMode("existing");
                        setSelectedAccountId(e.target.value);
                      }
                    }}
                  >
                    <option value="">Choose an existing account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    <option value="__new__">+ This is a new site — create it</option>
                  </select>
                </label>
                {targetMode === "new" && (
                  <>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                      New site name <span style={{ color: "var(--red)" }}>*</span>
                      <input
                        style={inputStyle}
                        value={newSiteName}
                        onChange={(e) => setNewSiteName(e.target.value)}
                        placeholder="e.g. Warehouse 3 — Galway"
                      />
                    </label>
                    {fuelTypeUncertain && (
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--amber)", fontSize: 12.5, marginBottom: 12, background: "var(--bg)", padding: "8px 10px", borderRadius: 6 }}>
                        <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                        Couldn't tell from the bill whether this is gas or electricity — everything else was read fine, just confirm below.
                      </div>
                    )}
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: fuelTypeUncertain ? "var(--amber)" : "var(--muted)", marginBottom: 10, fontWeight: fuelTypeUncertain ? 600 : 400 }}>
                      Fuel type{fuelTypeUncertain ? " — please confirm" : ""}
                      <select
                        style={{ ...inputStyle, borderColor: fuelTypeUncertain ? "var(--amber)" : "var(--border)" }}
                        value={newSiteFuelType}
                        onChange={(e) => {
                          setNewSiteFuelType(e.target.value);
                          setFuelTypeUncertain(false);
                        }}
                      >
                        <option value="electricity">Electricity</option>
                        <option value="gas">Gas</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                      MPRN/GPRN <span style={{ color: "var(--red)" }}>*</span>
                      <input
                        style={inputStyle}
                        value={newSiteAccountNumber}
                        onChange={(e) => setNewSiteAccountNumber(e.target.value)}
                        placeholder="Check the bill if not filled in automatically"
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                Billing period end date
                <input type="date" style={inputStyle} value={extracted.reading_date || ""} onChange={set("reading_date")} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                Usage (kWh)
                <input type="number" style={inputStyle} value={extracted.usage || ""} onChange={set("usage")} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                Unit rate (c/kWh)
                <input type="number" step="0.01" style={inputStyle} value={extracted.rate || ""} onChange={set("rate")} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                Standing charge (c/day)
                <input type="number" step="0.01" style={inputStyle} value={extracted.standing_charge || ""} onChange={set("standing_charge")} />
              </label>
            </div>

            {extracted.contract_end && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text)", marginBottom: 8 }}>
                  <input type="checkbox" checked={syncContractEnd} onChange={(e) => setSyncContractEnd(e.target.checked)} />
                  This bill shows a contract end date — update the account's renewal date to:
                </label>
                <input
                  type="date"
                  style={{ ...inputStyle, opacity: syncContractEnd ? 1 : 0.5 }}
                  value={contractEndValue}
                  onChange={(e) => setContractEndValue(e.target.value)}
                  disabled={!syncContractEnd}
                />
              </div>
            )}

            {(extracted.mic_kva || extracted.spc_kwh) && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text)", marginBottom: 8 }}>
                  <input type="checkbox" checked={syncCapacity} onChange={(e) => setSyncCapacity(e.target.checked)} />
                  This bill shows a {extracted.fuel_type === "gas" ? "Supply Point Capacity" : "MIC"} — update the account to:
                </label>
                <input
                  type="number"
                  style={{ ...inputStyle, opacity: syncCapacity ? 1 : 0.5 }}
                  value={capacityValue}
                  onChange={(e) => setCapacityValue(e.target.value)}
                  disabled={!syncCapacity}
                />
              </div>
            )}

            {extracted.dg_group && extracted.fuel_type !== "gas" && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text)", marginBottom: 8 }}>
                  <input type="checkbox" checked={syncDgGroup} onChange={(e) => setSyncDgGroup(e.target.checked)} />
                  This bill shows a Distribution Group — update the account to:
                </label>
                <input
                  style={{ ...inputStyle, opacity: syncDgGroup ? 1 : 0.5 }}
                  value={dgGroupValue}
                  onChange={(e) => setDgGroupValue(e.target.value)}
                  disabled={!syncDgGroup}
                />
              </div>
            )}
            {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setStage("pick")} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                Try another file
              </button>
              {fileQueue.length > 0 && (
                <button
                  onClick={() => advanceToNextInQueue()}
                  style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                >
                  Skip this one
                </button>
              )}
              <button
                onClick={handleSave}
                style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                Save reading
              </button>
            </div>
          </div>
        )}

        {stage === "saving" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "30px 0", color: "var(--muted)" }}>
            <Loader2 size={22} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Saving…</span>
          </div>
        )}
      </div>
    </div>
  );
}

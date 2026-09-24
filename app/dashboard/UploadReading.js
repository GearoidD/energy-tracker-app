"use client";

import { useState, useRef } from "react";
import {
  Upload,
  X,
  Loader2,
  AlertTriangle,
  Camera,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
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

    reader.onload = () => {
      try {
        resolve(reader.result.split(",")[1]);
      } catch (e) {
        reject(e);
      }
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function convertHeicIfNeeded(file) {
  if (!file) return file;

  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name || "");

  if (!isHeic) return file;

  const heic2any = (await import("heic2any")).default;

  const convertedBlob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.95,
  });

  const blob = Array.isArray(convertedBlob)
    ? convertedBlob[0]
    : convertedBlob;

  return new File(
    [blob],
    (file.name || "photo").replace(/\.\w+$/, ".jpg"),
    {
      type: "image/jpeg",
    }
  );
}

async function compressImage(
  file,
  maxDimension = 2200,
  quality = 0.88
) {
  if (!file) return file;

  if (file.type === "application/pdf") {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
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

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't process that image"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Couldn't process that image"));
            return;
          }

          resolve(
            new File(
              [blob],
              (file.name || "photo").replace(/\.\w+$/, ".jpg"),
              {
                type: "image/jpeg",
              }
            )
          );
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };

    img.src = url;
  });
}

// accountId: an existing account's id, or null if this bill might be for a new site
export default function UploadReading({
  accountId,
  companyId,
  accounts = [],
  onDone,
  onCancel,
}) {
  const [stage, setStage] = useState("pick");
  // pick, extracting, confirm, saving

  const [error, setError] = useState(null);
  const [extracted, setExtracted] = useState(null);

  const [targetMode, setTargetMode] = useState(
    accountId ? "existing" : "choose"
  );

  const [selectedAccountId, setSelectedAccountId] = useState(
    accountId || ""
  );

  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAccountNumber, setNewSiteAccountNumber] =
    useState("");

  const [newSiteFuelType, setNewSiteFuelType] =
    useState("electricity");

  const [contractEndValue, setContractEndValue] = useState("");
  const [syncContractEnd, setSyncContractEnd] = useState(true);

  const [capacityValue, setCapacityValue] = useState("");
  const [syncCapacity, setSyncCapacity] = useState(true);

  const [isDragOver, setIsDragOver] = useState(false);

  /*
   * BILL PHOTOS
   *
   * Front is required.
   * Back is optional.
   */
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);

  const [frontPreview, setFrontPreview] = useState(null);
  const [backPreview, setBackPreview] = useState(null);

  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  /*
   * This allows the user to upload multiple bills,
   * but each bill is processed as its own front/back pair.
   *
   * For now, the normal flow is one bill at a time.
   */
  const [fileQueue, setFileQueue] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [touchedAccountIds, setTouchedAccountIds] = useState([]);

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

    setFrontFile(null);
    setBackFile(null);

    if (frontPreview) {
      URL.revokeObjectURL(frontPreview);
    }

    if (backPreview) {
      URL.revokeObjectURL(backPreview);
    }

    setFrontPreview(null);
    setBackPreview(null);

    setError(null);
  };

  const setPreviewForFile = (file, side) => {
    if (!file) return;

    const preview = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null;

    if (side === "front") {
      if (frontPreview) {
        URL.revokeObjectURL(frontPreview);
      }

      setFrontFile(file);
      setFrontPreview(preview);
    } else {
      if (backPreview) {
        URL.revokeObjectURL(backPreview);
      }

      setBackFile(file);
      setBackPreview(preview);
    }

    setError(null);
  };

  const handlePhotoSelect = (file, side) => {
    if (!file) return;

    const validImage =
      file.type.startsWith("image/") ||
      file.type === "application/pdf";

    if (!validImage) {
      setError(
        "Please upload an image or PDF."
      );
      return;
    }

    setPreviewForFile(file, side);
  };

  /*
   * Process front + back as ONE bill.
   */
  const processBillPhotos = async () => {
    if (!frontFile) {
      setError(
        "Please upload the front of the bill first."
      );
      return;
    }

    setError(null);
    setStage("extracting");

    try {
      /*
       * FRONT
       */
      const frontConverted =
        await convertHeicIfNeeded(frontFile);

      const frontCompressed =
        await compressImage(frontConverted);

      const frontBase64 =
        await fileToBase64(frontCompressed);

      /*
       * BACK
       *
       * Optional.
       */
      let backPayload = null;

      if (backFile) {
        const backConverted =
          await convertHeicIfNeeded(backFile);

        const backCompressed =
          await compressImage(backConverted);

        const backBase64 =
          await fileToBase64(backCompressed);

        backPayload = {
          base64: backBase64,
          mediaType: backCompressed.type,
        };
      }

      /*
       * Send both sides together.
       */
      const res = await fetch("/api/extract-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          front: {
            base64: frontBase64,
            mediaType: frontCompressed.type,
          },
          back: backPayload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Extraction failed"
        );
      }

      if (!data.extracted) {
        throw new Error(
          "No bill information could be extracted."
        );
      }

      setExtracted(data.extracted);

      setContractEndValue(
        data.extracted.contract_end || ""
      );

      setCapacityValue(
        data.extracted.fuel_type === "gas"
          ? data.extracted.spc_kwh || ""
          : data.extracted.mic_kva || ""
      );

      /*
       * Automatically match the MPRN/GPRN to an
       * existing account.
       */
      if (!accountId) {
        const matched =
          data.extracted.account_number
            ? accounts.find(
                (a) =>
                  a.account_number &&
                  a.account_number ===
                    data.extracted.account_number
              )
            : null;

        if (matched) {
          setTargetMode("existing");
          setSelectedAccountId(matched.id);
        } else {
          setTargetMode("choose");

          setNewSiteName(
            data.extracted.provider
              ? `${data.extracted.provider} account`
              : ""
          );

          setNewSiteAccountNumber(
            data.extracted.account_number || ""
          );

          setNewSiteFuelType(
            data.extracted.fuel_type === "gas"
              ? "gas"
              : "electricity"
          );
        }
      }

      setStage("confirm");
    } catch (e) {
      console.error("Bill extraction error:", e);

      setError(
        e?.message ||
          "Couldn't read the bill. Please try again."
      );

      setStage("pick");
    }
  };

  /*
   * Drag/drop a front image.
   */
  const handleFrontDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];

    if (file) {
      handlePhotoSelect(file, "front");
    }
  };

  /*
   * Drag/drop a back image.
   */
  const handleBackDrop = (e) => {
    e.preventDefault();

    const file = e.dataTransfer.files?.[0];

    if (file) {
      handlePhotoSelect(file, "back");
    }
  };

  /*
   * Remove a photo.
   */
  const removePhoto = (side) => {
    if (side === "front") {
      if (frontPreview) {
        URL.revokeObjectURL(frontPreview);
      }

      setFrontFile(null);
      setFrontPreview(null);
    } else {
      if (backPreview) {
        URL.revokeObjectURL(backPreview);
      }

      setBackFile(null);
      setBackPreview(null);
    }
  };

  const advanceToNextInQueue = () => {
    if (fileQueue.length === 0) {
      return false;
    }

    const [next, ...rest] = fileQueue;

    setFileQueue(rest);

    setBatchIndex((i) => i + 1);

    resetPerBillState();

    /*
     * A queued item can be either:
     *
     * {
     *   front: File,
     *   back: File | null
     * }
     *
     * or an old-style File, which is treated as
     * the front.
     */
    if (next?.front) {
      setPreviewForFile(next.front, "front");

      if (next.back) {
        setPreviewForFile(next.back, "back");
      }
    } else {
      setPreviewForFile(next, "front");
    }

    return true;
  };

  const set = (k) => (e) =>
    setExtracted((f) => ({
      ...f,
      [k]: e.target.value,
    }));

  /*
   * Save the extracted reading.
   */
  const handleSave = async () => {
    setError(null);

    if (!extracted) {
      setError(
        "There is no extracted bill information to save."
      );
      return;
    }

    const supabase = createClient();

    let finalAccountId = selectedAccountId;

    /*
     * CREATE NEW ACCOUNT
     */
    if (targetMode === "new") {
      if (!newSiteName.trim()) {
        alert("Give this site a name first.");
        return;
      }

      if (!newSiteAccountNumber.trim()) {
        alert(
          "MPRN/GPRN is required — check the bill or enter it manually."
        );
        return;
      }

      setStage("saving");

      const { data: newAccount, error: accError } =
        await supabase
          .from("accounts")
          .insert({
            company_id: companyId,
            name: newSiteName,
            provider: extracted.provider || null,
            account_number:
              newSiteAccountNumber,
            fuel_type: newSiteFuelType,
            rate: extracted.rate || null,
            standing_charge:
              extracted.standing_charge || null,
            usage: extracted.usage || null,
            contract_end:
              syncContractEnd &&
              contractEndValue
                ? contractEndValue
                : null,
            mic_kva:
              newSiteFuelType !== "gas" &&
              capacityValue
                ? capacityValue
                : null,
            spc_kwh:
              newSiteFuelType === "gas" &&
              capacityValue
                ? capacityValue
                : null,
          })
          .select()
          .single();

      if (accError) {
        const isDuplicate =
          accError.code === "23505" ||
          (accError.message || "").includes(
            "accounts_company_account_number_unique"
          );

        if (isDuplicate) {
          alert(
            "That MPRN/GPRN is already used by another account — pick it from the dropdown instead of creating a new one."
          );
        } else {
          setError(accError.message);
        }

        setStage("confirm");
        return;
      }

      finalAccountId = newAccount.id;
    } else {
      /*
       * EXISTING ACCOUNT
       */
      if (!finalAccountId) {
        alert(
          "Choose which account this bill belongs to."
        );
        return;
      }

      setStage("saving");

      /*
       * Update contract end date if requested.
       */
      if (
        syncContractEnd &&
        contractEndValue
      ) {
        const { error: contractError } =
          await supabase
            .from("accounts")
            .update({
              contract_end: contractEndValue,
            })
            .eq("id", finalAccountId);

        if (contractError) {
          console.error(
            "Contract end update failed:",
            contractError
          );
        }
      }

      /*
       * Update MIC/SPC if requested.
       */
      if (
        syncCapacity &&
        capacityValue
      ) {
        const matchedAccount =
          accounts.find(
            (a) => a.id === finalAccountId
          );

        const field =
          matchedAccount?.fuel_type === "gas"
            ? "spc_kwh"
            : "mic_kva";

        const { error: capacityError } =
          await supabase
            .from("accounts")
            .update({
              [field]: capacityValue,
            })
            .eq("id", finalAccountId);

        if (capacityError) {
          console.error(
            "Capacity update failed:",
            capacityError
          );
        }
      }
    }

    /*
     * SAVE READING
     */
    const { error: readingError } =
      await supabase
        .from("readings")
        .insert({
          account_id: finalAccountId,
          company_id: companyId,
          reading_date:
            extracted.reading_date || null,
          usage:
            extracted.usage || null,
          rate:
            extracted.rate || null,
          standing_charge:
            extracted.standing_charge || null,
          source: "upload",
          confidence:
            extracted.confidence || null,
        });

    if (readingError) {
      const isDuplicate =
        readingError.code === "23505" ||
        (readingError.message || "").includes(
          "readings_account_date_unique"
        );

      if (isDuplicate) {
        alert(
          "A reading for this account on this date has already been saved — this bill may already be in the system."
        );
      } else {
        setError(readingError.message);
      }

      setStage("confirm");
      return;
    }

    /*
     * Successful save.
     */
    const nextTouched = [
      ...touchedAccountIds,
      finalAccountId,
    ];

    setTouchedAccountIds(nextTouched);

    /*
     * Continue with queued bills if any.
     */
    if (fileQueue.length > 0) {
      advanceToNextInQueue();
    } else {
      onDone(nextTouched);
    }
  };

  const resetToPick = () => {
    setStage("pick");
    setError(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,12,14,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 20,
        overflowY: "auto",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border-light)",
          borderRadius: 12,
          width: 500,
          maxWidth: "100%",
          padding: 24,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              fontFamily:
                "'Manrope', sans-serif",
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Upload a bill
          </h2>

          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* BATCH INDICATOR */}
        {batchTotal > 1 &&
          (stage === "extracting" ||
            stage === "confirm" ||
            stage === "saving") && (
            <div
              style={{
                fontSize: 12,
                color: "var(--teal)",
                marginBottom: 12,
                fontWeight: 600,
              }}
            >
              Bill {batchIndex} of {batchTotal}
            </div>
          )}

        {/* =========================================================
            PICK FRONT + BACK
        ========================================================= */}
        {stage === "pick" && (
          <div>
            <p
              style={{
                fontSize: 13,
                color: "var(--muted)",
                marginBottom: 18,
                lineHeight: 1.5,
              }}
            >
              Take a photo of the front of the bill.
              If there is useful information on the
              back, upload that too. Both sides will be
              read together as one bill.
            </p>

            {/* FRONT CARD */}
            <div
              style={{
                border:
                  "1px dashed var(--border-light)",
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() =>
                setIsDragOver(false)
              }
              onDrop={handleFrontDrop}
            >
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const file =
                    e.target.files?.[0];

                  if (file) {
                    handlePhotoSelect(
                      file,
                      "front"
                    );
                  }

                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />

              {frontFile ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <CheckCircle2
                        size={18}
                        color="var(--teal)"
                      />

                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Front of bill
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color:
                              "var(--muted)",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                            whiteSpace:
                              "nowrap",
                            maxWidth: 300,
                          }}
                        >
                          {frontFile.name}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        removePhoto("front")
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color:
                          "var(--muted)",
                        cursor:
                          "pointer",
                        padding: 4,
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {frontPreview && (
                    <img
                      src={frontPreview}
                      alt="Front of bill"
                      style={{
                        width: "100%",
                        maxHeight: 220,
                        objectFit: "contain",
                        marginTop: 12,
                        borderRadius: 6,
                        background:
                          "var(--bg)",
                      }}
                    />
                  )}
                </div>
              ) : (
                <button
                  onClick={() =>
                    frontInputRef.current?.click()
                  }
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    color: "var(--text)",
                    cursor: "pointer",
                    padding: 10,
                  }}
                >
                  <Camera
                    size={26}
                    color="var(--teal)"
                  />

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Take photo — Front
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginTop: 5,
                    }}
                  >
                    Tap to open camera or
                    choose a file
                  </div>

                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginTop: 5,
                    }}
                  >
                    You can also drag a file here
                  </div>
                </button>
              )}
            </div>

            {/* BACK CARD */}
            <div
              style={{
                border:
                  "1px dashed var(--border-light)",
                borderRadius: 10,
                padding: 16,
                marginBottom: 16,
              }}
              onDragOver={(e) =>
                e.preventDefault()
              }
              onDrop={handleBackDrop}
            >
              <input
                ref={backInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const file =
                    e.target.files?.[0];

                  if (file) {
                    handlePhotoSelect(
                      file,
                      "back"
                    );
                  }

                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />

              {backFile ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <CheckCircle2
                        size={18}
                        color="var(--teal)"
                      />

                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Back of bill
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color:
                              "var(--muted)",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                            whiteSpace:
                              "nowrap",
                            maxWidth: 300,
                          }}
                        >
                          {backFile.name}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        removePhoto("back")
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color:
                          "var(--muted)",
                        cursor:
                          "pointer",
                        padding: 4,
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {backPreview && (
                    <img
                      src={backPreview}
                      alt="Back of bill"
                      style={{
                        width: "100%",
                        maxHeight: 220,
                        objectFit: "contain",
                        marginTop: 12,
                        borderRadius: 6,
                        background:
                          "var(--bg)",
                      }}
                    />
                  )}
                </div>
              ) : (
                <button
                  onClick={() =>
                    backInputRef.current?.click()
                  }
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    color: "var(--text)",
                    cursor: "pointer",
                    padding: 10,
                  }}
                >
                  <Camera
                    size={26}
                    color="var(--muted)"
                  />

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Take photo — Back
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginTop: 5,
                    }}
                  >
                    Optional — only if the
                    back contains useful
                    information
                  </div>
                </button>
              )}
            </div>

            {/* ERROR */}
            {error && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems:
                    "flex-start",
                  color: "var(--red)",
                  fontSize: 13,
                  marginTop: 12,
                  marginBottom: 12,
                }}
              >
                <AlertTriangle
                  size={14}
                  style={{
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                />

                <span>{error}</span>
              </div>
            )}

            {/* READ BUTTON */}
            <button
              onClick={processBillPhotos}
              disabled={!frontFile}
              style={{
                width: "100%",
                background: frontFile
                  ? "var(--teal)"
                  : "var(--border)",
                border: "none",
                color: frontFile
                  ? "#ffffff"
                  : "var(--muted)",
                padding: "11px 18px",
                borderRadius: 6,
                cursor: frontFile
                  ? "pointer"
                  : "not-allowed",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Upload size={15} />
                Read bill
              </span>
            </button>
          </div>
        )}

        {/* =========================================================
            EXTRACTING
        ========================================================= */}
        {stage === "extracting" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "40px 0",
              color: "var(--muted)",
            }}
          >
            <Loader2
              size={24}
              className="animate-spin"
            />

            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Reading the bill…
            </span>

            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textAlign: "center",
              }}
            >
              {backFile
                ? "Checking both sides of the bill"
                : "Reading the bill"}
            </span>
          </div>
        )}

        {/* =========================================================
            CONFIRM
        ========================================================= */}
        {stage === "confirm" &&
          extracted && (
            <div>
              {/* LOW CONFIDENCE */}
              {extracted.confidence ===
                "low" && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems:
                      "flex-start",
                    color: "var(--amber)",
                    fontSize: 12.5,
                    marginBottom: 14,
                    background:
                      "var(--bg)",
                    padding:
                      "8px 10px",
                    borderRadius: 6,
                  }}
                >
                  <AlertTriangle
                    size={14}
                    style={{
                      marginTop: 1,
                      flexShrink: 0,
                    }}
                  />

                  <span>
                    Some of this was
                    hard to read clearly
                    — double-check the
                    numbers below before
                    saving.
                  </span>
                </div>
              )}

              {/* RATE NOTE */}
              {extracted.rate_note && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems:
                      "flex-start",
                    color: "var(--amber)",
                    fontSize: 12.5,
                    marginBottom: 14,
                    background:
                      "var(--bg)",
                    padding:
                      "8px 10px",
                    borderRadius: 6,
                  }}
                >
                  <AlertTriangle
                    size={14}
                    style={{
                      marginTop: 1,
                      flexShrink: 0,
                    }}
                  />

                  <span>
                    This bill has more
                    than one rate:{" "}
                    {
                      extracted.rate_note
                    }
                    . The single rate
                    below is simplified
                    — adjust it if needed.
                  </span>
                </div>
              )}

              {/* ACCOUNT MATCHING */}
              {!accountId && (
                <div
                  style={{
                    marginBottom: 16,
                    paddingBottom: 16,
                    borderBottom:
                      "1px solid var(--border)",
                  }}
                >
                  {targetMode ===
                    "existing" &&
                    selectedAccountId &&
                    extracted.account_number && (
                      <div
                        style={{
                          fontSize: 12.5,
                          color:
                            "var(--teal)",
                          marginBottom: 10,
                        }}
                      >
                        Matched to{" "}
                        <strong>
                          {
                            accounts.find(
                              (a) =>
                                a.id ===
                                selectedAccountId
                            )?.name
                          }
                        </strong>{" "}
                        by MPRN/GPRN —
                        change below if
                        that's wrong.
                      </div>
                    )}

                  <label
                    style={{
                      display: "flex",
                      flexDirection:
                        "column",
                      gap: 6,
                      fontSize: 12,
                      color:
                        "var(--muted)",
                      marginBottom: 10,
                    }}
                  >
                    Which account is
                    this for?

                    <select
                      style={inputStyle}
                      value={
                        targetMode ===
                        "new"
                          ? "__new__"
                          : selectedAccountId
                      }
                      onChange={(e) => {
                        if (
                          e.target
                            .value ===
                          "__new__"
                        ) {
                          setTargetMode(
                            "new"
                          );
                          setSelectedAccountId(
                            ""
                          );
                        } else {
                          setTargetMode(
                            "existing"
                          );
                          setSelectedAccountId(
                            e.target.value
                          );
                        }
                      }}
                    >
                      <option value="">
                        Choose an existing
                        account…
                      </option>

                      {accounts.map(
                        (a) => (
                          <option
                            key={a.id}
                            value={a.id}
                          >
                            {a.name}
                          </option>
                        )
                      )}

                      <option value="__new__">
                        + This is a new
                        site — create it
                      </option>
                    </select>
                  </label>

                  {/* NEW SITE */}
                  {targetMode ===
                    "new" && (
                    <>
                      <label
                        style={{
                          display:
                            "flex",
                          flexDirection:
                            "column",
                          gap: 6,
                          fontSize: 12,
                          color:
                            "var(--muted)",
                          marginBottom:
                            10,
                        }}
                      >
                        New site name{" "}
                        <span
                          style={{
                            color:
                              "var(--red)",
                          }}
                        >
                          *
                        </span>

                        <input
                          style={
                            inputStyle
                          }
                          value={
                            newSiteName
                          }
                          onChange={(e) =>
                            setNewSiteName(
                              e.target
                                .value
                            )
                          }
                          placeholder="e.g. Warehouse 3 — Galway"
                        />
                      </label>

                      <label
                        style={{
                          display:
                            "flex",
                          flexDirection:
                            "column",
                          gap: 6,
                          fontSize: 12,
                          color:
                            "var(--muted)",
                          marginBottom:
                            10,
                        }}
                      >
                        Fuel type

                        <select
                          style={
                            inputStyle
                          }
                          value={
                            newSiteFuelType
                          }
                          onChange={(e) =>
                            setNewSiteFuelType(
                              e.target
                                .value
                            )
                          }
                        >
                          <option value="electricity">
                            Electricity
                          </option>

                          <option value="gas">
                            Gas
                          </option>
                        </select>
                      </label>

                      <label
                        style={{
                          display:
                            "flex",
                          flexDirection:
                            "column",
                          gap: 6,
                          fontSize: 12,
                          color:
                            "var(--muted)",
                        }}
                      >
                        MPRN/GPRN{" "}
                        <span
                          style={{
                            color:
                              "var(--red)",
                          }}
                        >
                          *
                        </span>

                        <input
                          style={
                            inputStyle
                          }
                          value={
                            newSiteAccountNumber
                          }
                          onChange={(e) =>
                            setNewSiteAccountNumber(
                              e.target
                                .value
                            )
                          }
                          placeholder="Check the bill if not filled in automatically"
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* READING FIELDS */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: 6,
                    fontSize: 12,
                    color:
                      "var(--muted)",
                  }}
                >
                  Billing period end
                  date

                  <input
                    type="date"
                    style={inputStyle}
                    value={
                      extracted.reading_date ||
                      ""
                    }
                    onChange={set(
                      "reading_date"
                    )}
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: 6,
                    fontSize: 12,
                    color:
                      "var(--muted)",
                  }}
                >
                  Usage (kWh)

                  <input
                    type="number"
                    style={inputStyle}
                    value={
                      extracted.usage ||
                      ""
                    }
                    onChange={set(
                      "usage"
                    )}
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: 6,
                    fontSize: 12,
                    color:
                      "var(--muted)",
                  }}
                >
                  Unit rate (c/kWh)

                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={
                      extracted.rate ||
                      ""
                    }
                    onChange={set(
                      "rate"
                    )}
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: 6,
                    fontSize: 12,
                    color:
                      "var(--muted)",
                  }}
                >
                  Standing charge
                  (c/day)

                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={
                      extracted.standing_charge ||
                      ""
                    }
                    onChange={set(
                      "standing_charge"
                    )}
                  />
                </label>
              </div>

              {/* CONTRACT END */}
              {extracted.contract_end && (
                <div
                  style={{
                    background:
                      "var(--bg)",
                    border:
                      "1px solid var(--border)",
                    borderRadius: 8,
                    padding:
                      "10px 12px",
                    marginBottom: 16,
                  }}
                >
                  <label
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: 8,
                      fontSize: 12.5,
                      color:
                        "var(--text)",
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        syncContractEnd
                      }
                      onChange={(e) =>
                        setSyncContractEnd(
                          e.target
                            .checked
                        )
                      }
                    />

                    This bill shows a
                    contract end date —
                    update the account's
                    renewal date to:
                  </label>

                  <input
                    type="date"
                    style={{
                      ...inputStyle,
                      opacity:
                        syncContractEnd
                          ? 1
                          : 0.5,
                    }}
                    value={
                      contractEndValue
                    }
                    onChange={(e) =>
                      setContractEndValue(
                        e.target
                          .value
                      )
                    }
                    disabled={
                      !syncContractEnd
                    }
                  />
                </div>
              )}

              {/* CAPACITY */}
              {(extracted.mic_kva ||
                extracted.spc_kwh) && (
                <div
                  style={{
                    background:
                      "var(--bg)",
                    border:
                      "1px solid var(--border)",
                    borderRadius: 8,
                    padding:
                      "10px 12px",
                    marginBottom: 16,
                  }}
                >
                  <label
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: 8,
                      fontSize: 12.5,
                      color:
                        "var(--text)",
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        syncCapacity
                      }
                      onChange={(e) =>
                        setSyncCapacity(
                          e.target
                            .checked
                        )
                      }
                    />

                    This bill shows a{" "}
                    {extracted.fuel_type ===
                    "gas"
                      ? "Supply Point Capacity"
                      : "MIC"}{" "}
                    — update the
                    account to:
                  </label>

                  <input
                    type="number"
                    style={{
                      ...inputStyle,
                      opacity:
                        syncCapacity
                          ? 1
                          : 0.5,
                    }}
                    value={
                      capacityValue
                    }
                    onChange={(e) =>
                      setCapacityValue(
                        e.target
                          .value
                      )
                    }
                    disabled={
                      !syncCapacity
                    }
                  />
                </div>
              )}

              {/* ERROR */}
              {error && (
                <div
                  style={{
                    color:
                      "var(--red)",
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}

              {/* ACTIONS */}
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "flex-end",
                  gap: 10,
                }}
              >
                <button
                  onClick={resetToPick}
                  style={{
                    background: "none",
                    border:
                      "1px solid var(--border)",
                    color:
                      "var(--muted)",
                    padding:
                      "9px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Try another bill
                </button>

                {fileQueue.length >
                  0 && (
                  <button
                    onClick={() =>
                      advanceToNextInQueue()
                    }
                    style={{
                      background:
                        "none",
                      border:
                        "1px solid var(--border)",
                      color:
                        "var(--muted)",
                      padding:
                        "9px 16px",
                      borderRadius: 6,
                      cursor:
                        "pointer",
                      fontSize: 13,
                    }}
                  >
                    Skip this one
                  </button>
                )}

                <button
                  onClick={handleSave}
                  style={{
                    background:
                      "var(--teal)",
                    border: "none",
                    color: "#ffffff",
                    padding:
                      "9px 18px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Save reading
                </button>
              </div>
            </div>
          )}

        {/* =========================================================
            SAVING
        ========================================================= */}
        {stage === "saving" && (
          <div
            style={{
              display: "flex",
              flexDirection:
                "column",
              alignItems:
                "center",
              gap: 10,
              padding: "40px 0",
              color:
                "var(--muted)",
            }}
          >
            <Loader2
              size={24}
              className="animate-spin"
            />

            <span
              style={{
                fontSize: 13,
              }}
            >
              Saving…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
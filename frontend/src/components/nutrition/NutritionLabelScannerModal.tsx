import { useState, useRef } from "react";
import { Camera, Loader2, RefreshCw, ShieldAlert, AlertTriangle, ThumbsUp } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { useApp } from "../../store/app";
import { Modal, PrimaryButton, GhostButton, inputBase } from "../common/forms";
import type { ScannedNutritionLabel } from "../../lib/nutritionTypes";

export function NutritionLabelScannerModal() {
  const scannerModalOpen = useNutrition((s) => s.scannerModalOpen);
  const setScannerModalOpen = useNutrition((s) => s.setScannerModalOpen);
  const scanNutritionLabel = useNutrition((s) => s.scanNutritionLabel);
  const saveFoodToLibrary = useNutrition((s) => s.saveFoodToLibrary);
  const toast = useApp((s) => s.toast);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedNutritionLabel | null>(null);

  // Formulario editable para guardar
  const [productName, setProductName] = useState("");
  const [servingSize, setServingSize] = useState<number>(100);
  const [servingUnit, setServingUnit] = useState("g");
  const [calories, setCalories] = useState<number>(0);
  const [protein, setProtein] = useState<number>(0);
  const [carbs, setCarbs] = useState<number>(0);
  const [fat, setFat] = useState<number>(0);
  const [category, setCategory] = useState("General");

  if (!scannerModalOpen) return null;

  const handleClose = () => {
    setScannerModalOpen(false);
    setImagePreview(null);
    setScanning(false);
    setError(null);
    setScannedData(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      void runScan(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const runScan = async (dataUrl: string) => {
    setScanning(true);
    setError(null);
    try {
      const res = await scanNutritionLabel(dataUrl);
      setScannedData(res);
      setProductName(res.product_name);
      setServingSize(res.serving_size);
      setServingUnit(res.serving_unit);
      setCalories(res.calories);
      setProtein(res.protein);
      setCarbs(res.carbs);
      setFat(res.fat);
      setCategory(res.category || "General");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveToPantry = async () => {
    if (!productName.trim()) return;
    try {
      await saveFoodToLibrary({
        name: productName.trim(),
        serving_size: Math.max(1, servingSize),
        serving_unit: servingUnit.trim() || "g",
        calories: Math.max(0, Math.round(calories)),
        protein: Math.max(0, protein),
        carbs: Math.max(0, carbs),
        fat: Math.max(0, fat),
        category: category || "General",
      });
      toast("info", `«${productName.trim()}» guardado en tu despensa`);
      handleClose();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  return (
    <Modal
      title="Escanear Tabla Nutricional y Recomendación IA"
      onClose={handleClose}
      width={680}
    >
      <div className="space-y-4 text-main" data-testid="nutrition-label-scanner-modal">
        <p className="text-[12px] text-faint">
          Sube o toma una foto de la tabla de información nutricional. La IA leerá la porción y macros, y evaluará si se alinea con tu objetivo y restricciones.
        </p>

        {/* Zona de captura / subida */}
        {!imagePreview ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-card/40 p-8 text-center transition-colors hover:border-accent hover:bg-accent/5 cursor-pointer group"
            data-testid="scanner-dropzone"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent mb-3 group-hover:scale-110 transition-transform">
              <Camera size={24} />
            </div>
            <span className="text-[13px] font-semibold text-main">
              Subir foto de etiqueta o usar cámara
            </span>
            <span className="text-[11px] text-faint mt-1 max-w-xs">
              Haz clic para elegir una imagen o arrástrala aquí desde tu galería o móvil.
            </span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden"
              data-testid="scanner-file-input"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tarjeta de Veredicto Inteligente de la IA */}
            {scannedData?.verdict && (
              <div
                className={`rounded-2xl border p-4 space-y-2.5 transition-all ${
                  scannedData.verdict === "recomendado"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : scannedData.verdict === "contraindicado"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }`}
                data-testid="scanner-verdict-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-[13.5px]">
                    {scannedData.verdict === "recomendado" ? (
                      <>
                        <ThumbsUp size={17} />
                        <span>Recomendado para tu objetivo</span>
                      </>
                    ) : scannedData.verdict === "contraindicado" ? (
                      <>
                        <ShieldAlert size={17} />
                        <span>Contraindicado según tus restricciones</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={17} />
                        <span>Consumir con moderación</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-background/40">
                    Veredicto IA
                  </span>
                </div>

                {scannedData.verdict_reason && (
                  <p className="text-[12px] text-main leading-relaxed">
                    {scannedData.verdict_reason}
                  </p>
                )}

                {/* Pros y Contras */}
                {((scannedData.pros && scannedData.pros.length > 0) || (scannedData.cons && scannedData.cons.length > 0)) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-line/40 text-[11px]">
                    {scannedData.pros && scannedData.pros.length > 0 && (
                      <div className="space-y-0.5">
                        <span className="font-semibold text-emerald-400">Puntos a favor:</span>
                        <ul className="list-disc list-inside text-dim space-y-0.5">
                          {scannedData.pros.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {scannedData.cons && scannedData.cons.length > 0 && (
                      <div className="space-y-0.5">
                        <span className="font-semibold text-amber-400">A tener en cuenta:</span>
                        <ul className="list-disc list-inside text-dim space-y-0.5">
                          {scannedData.cons.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Vista previa de la foto */}
              <div className="space-y-2">
                <div className="relative rounded-xl border border-line bg-black/40 overflow-hidden max-h-60 flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="Etiqueta nutricional"
                    className="max-h-60 w-auto object-contain"
                  />
                  {scanning && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-main">
                      <Loader2 size={24} className="animate-spin text-accent" />
                      <span className="text-[12px] font-semibold">Leyendo tabla y analizando perfil…</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setScannedData(null);
                      setError(null);
                    }}
                    className="text-[11.5px] text-faint hover:text-dim flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> Cambiar imagen
                  </button>
                </div>
              </div>

              {/* Formulario con los datos extraídos */}
              <div className="space-y-3">
                {error && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-400">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-dim">Nombre del producto:</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ej. Avena Instantánea"
                    className={`${inputBase} text-[12.5px] font-semibold text-main`}
                    data-testid="input-scanned-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Porción base:</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={servingSize}
                      onChange={(e) => setServingSize(Number(e.target.value) || 100)}
                      className={`${inputBase} text-[12px]`}
                      data-testid="input-scanned-serving-size"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Unidad:</label>
                    <input
                      type="text"
                      value={servingUnit}
                      onChange={(e) => setServingUnit(e.target.value)}
                      placeholder="g, ml, scoop"
                      className={`${inputBase} text-[12px]`}
                      data-testid="input-scanned-serving-unit"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Calorías:</label>
                    <input
                      type="number"
                      min="0"
                      value={calories}
                      onChange={(e) => setCalories(Number(e.target.value) || 0)}
                      className={`${inputBase} text-[12px] font-bold text-main py-0.5`}
                      data-testid="input-scanned-calories"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Proteínas (g):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={protein}
                      onChange={(e) => setProtein(Number(e.target.value) || 0)}
                      className={`${inputBase} text-[12px] text-indigo-400 py-0.5`}
                      data-testid="input-scanned-protein"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Carbos (g):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={carbs}
                      onChange={(e) => setCarbs(Number(e.target.value) || 0)}
                      className={`${inputBase} text-[12px] text-amber-400 py-0.5`}
                      data-testid="input-scanned-carbs"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Grasas (g):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={fat}
                      onChange={(e) => setFat(Number(e.target.value) || 0)}
                      className={`${inputBase} text-[12px] text-rose-400 py-0.5`}
                      data-testid="input-scanned-fat"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <GhostButton onClick={handleClose} className="text-[12px]" data-testid="close-scanner-btn">
            Cancelar
          </GhostButton>
          <PrimaryButton
            onClick={handleSaveToPantry}
            disabled={!productName.trim() || scanning}
            className="text-[12.5px] px-5"
            data-testid="save-scanned-to-pantry-btn"
          >
            Guardar en mi Despensa
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";

type BarcodeScannerProps = {
  onScan: (barcode: string) => void;
  isBusy: boolean;
};

function BarcodeScanner({ onScan, isBusy }: BarcodeScannerProps) {
  const [manualCode, setManualCode] = useState("");
  const scannerBuffer = useRef("");
  const lastKeyAt = useRef(0);
  const lastScan = useRef({ barcode: "", at: 0 });

  function submitCode(code: string) {
    const barcode = code.trim();
    if (!barcode || isBusy) return;
    const now = Date.now();
    if (
      lastScan.current.barcode === barcode &&
      now - lastScan.current.at < 400
    ) {
      return;
    }
    lastScan.current = { barcode, at: now };
    scannerBuffer.current = "";
    setManualCode("");
    onScan(barcode);
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCode(manualCode);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "BUTTON"
      )
        return;
      if (event.key === "Enter") {
        submitCode(scannerBuffer.current);
        return;
      }
      if (!/^\d$/.test(event.key)) return;
      const now = Date.now();
      if (now - lastKeyAt.current > 80) scannerBuffer.current = "";
      scannerBuffer.current += event.key;
      lastKeyAt.current = now;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <form className="barcode-scanner" onSubmit={handleManualSubmit}>
      <label htmlFor="checkout-barcode">Código de barras</label>
      <div className="barcode-input-row">
        <input
          id="checkout-barcode"
          inputMode="numeric"
          placeholder="Digite ou passe o código no leitor"
          value={manualCode}
          onChange={(event) =>
            setManualCode(event.target.value.replace(/\D/g, ""))
          }
          disabled={isBusy}
        />
        <button
          type="submit"
          className="scan-button"
          disabled={isBusy || !manualCode}
        >
          Adicionar
        </button>
      </div>
    </form>
  );
}

export default BarcodeScanner;

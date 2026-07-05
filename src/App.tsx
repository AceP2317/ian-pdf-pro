import { useEffect, useRef, useState } from "react";
import { runSpike, SpikeResult } from "./spike";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const started = useRef(false);
  const [results, setResults] = useState<SpikeResult[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (started.current || !canvasRef.current) return;
    started.current = true;
    runSpike(canvasRef.current).then((r) => {
      setResults(r);
      setDone(true);
    });
  }, []);

  const allPass = done && results.every((r) => r.pass);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Ian PDF Pro — Phase 0 spike</h1>
      <p>
        {done
          ? allPass
            ? "ALL CHECKS PASSED"
            : "SOME CHECKS FAILED"
          : "Running checks…"}
      </p>
      <ul>
        {results.map((r) => (
          <li key={r.name}>
            {r.pass ? "✅" : "❌"} <strong>{r.name}</strong> — {r.detail}
          </li>
        ))}
      </ul>
      <canvas ref={canvasRef} style={{ border: "1px solid #ccc" }} />
    </main>
  );
}

export default App;

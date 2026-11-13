import { ImageResponse } from "next/og";

export const alt = "TrustCheck — Not sure if it’s real? Check suspicious links, messages and screenshots.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", background: "#090E17", color: "#F8FAFC", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, fontWeight: 700 }}>
        <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4.5 6v5.5c0 4.5 3 7.5 7.5 9.5 4.5-2 7.5-5 7.5-9.5V6L12 3Z" /><path d="m8.5 11.5 2.5 2.5 4.5-4.5" /></svg>
        TrustCheck
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.1 }}>Not sure if it’s real?</div>
        <div style={{ fontSize: 30, lineHeight: 1.5, maxWidth: 940, color: "#94A3B8" }}>Check suspicious links, messages and screenshots before you click, pay or reply.</div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #263244", paddingTop: 24, fontSize: 23, color: "#94A3B8" }}>A clearer view of risk. Not a guarantee of safety.</div>
    </div>, size,
  );
}

// Titlebar component

export function Titlebar() {
  return (
    <div className="titlebar">
      <div className="titlebar-drag-region">
         {/* The drag region allows the user to click and drag the window. 
             The actual minimize/maximize/close buttons are natively injected by Electron's titleBarOverlay */}
      </div>
    </div>
  );
}

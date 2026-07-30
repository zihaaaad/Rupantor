export interface FontObj {
  name: string;
  style: string;
  active: boolean;
  fontFamily: string;
  isSystem: boolean;
  path?: string; // Absolute path on the user's hard drive
  fontFaceInstance?: FontFace; // Used to prevent memory leaks when deleting custom fonts
}

export interface ScriptObj {
  id: string;
  name: string;
  path: string;
  targetApp: 'Photoshop' | 'AfterEffects' | 'Illustrator';
}

declare global {
  interface Window {
    electronAPI: {
      installFont: (fontPath: string, fontName: string) => Promise<{success: boolean, message: string}>;
      uninstallFont: (fontPath: string, fontName: string) => Promise<{success: boolean, message: string}>;
      getDbData: () => Promise<any>;
      saveDbData: (key: string, value: any) => void;
      executeScript: (scriptPath: string, targetApp: string) => Promise<{success: boolean, message: string}>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<{success: boolean}>;
      copyToVault: (filePath: string) => Promise<string>;
    }
  }
}

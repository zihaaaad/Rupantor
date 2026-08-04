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
  targetApp: 'Photoshop' | 'After Effects' | 'Illustrator';
}

export interface LicensePayload {
  name: string;
  email: string;
  plan: 'yearly' | 'lifetime';
  issuedAt: number;
  expiresAt: number | null;
}

export interface LicenseStatus {
  valid: boolean;
  reason?: string;
  payload?: LicensePayload;
}

declare global {
  interface Window {
    electronAPI: {
      pathForFile: (file: File) => string;
      installFont: (fontPath: string, fontName: string) => Promise<{success: boolean, message: string}>;
      uninstallFont: (fontPath: string, fontName: string) => Promise<{success: boolean, message: string}>;
      getDbData: () => Promise<any>;
      saveDbData: (key: string, value: any) => void;
      executeScript: (scriptPath: string, targetApp: string) => Promise<{success: boolean, message: string}>;
      readFile: (filePath: string) => Promise<{success: boolean, content?: string, message?: string}>;
      writeFile: (filePath: string, content: string) => Promise<{success: boolean}>;
      copyToVault: (filePath: string) => Promise<string>;
      deleteFromVault: (filePath: string) => Promise<{success: boolean, message?: string}>;
      getSystemFonts: () => Promise<string[]>;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      onUpdateNotAvailable: (callback: () => void) => () => void;
      onUpdateError: (callback: (message: string) => void) => () => void;
      downloadUpdate: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<void>;
      getLicenseStatus: () => Promise<LicenseStatus>;
      activateLicense: (key: string) => Promise<LicenseStatus>;
      deactivateDevice: () => Promise<{ ok: boolean; reason?: string }>;
      onLicenseInvalidated: (callback: (reason: string) => void) => () => void;
    }
  }
}

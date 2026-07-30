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

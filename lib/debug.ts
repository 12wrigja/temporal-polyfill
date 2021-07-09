interface GlobalDebugInfo {
  __debug__?: boolean;
}

export const DEBUG: boolean = !!(globalThis as GlobalDebugInfo).__debug__;

declare global {
  interface Window {
    zentyDesktop?: {
      platform: string;
      setLocale: (language: string) => Promise<void>;
      security: {
        get: () => Promise<import("./lib/security").PinState>;
        unlock: (pin: string) => Promise<import("./lib/security").PinState>;
        lock: () => Promise<import("./lib/security").PinState>;
        configure: (current: string, pin: string) => Promise<import("./lib/security").PinState & { recovery: string }>;
        disable: (pin: string) => Promise<import("./lib/security").PinState>;
        recover: (code: string) => Promise<import("./lib/security").PinState>;
        onState: (listener: (state: import("./lib/security").PinState) => void) => () => void;
      };
      updates: {
        get:()=>Promise<import("./lib/updates").UpdateState>;
        check:()=>Promise<import("./lib/updates").UpdateState>;
        download:()=>Promise<import("./lib/updates").UpdateState>;
        install:()=>Promise<import("./lib/updates").UpdateState>;
        onState:(listener:(state:import("./lib/updates").UpdateState)=>void)=>()=>void;
      };
      onIntegrationRequest: (listener: (action: string, input: unknown) => Promise<unknown>) => () => void;
      spotifySession: {
        get: () => Promise<import("./context/IntegrationsStore").Session | null>;
        set: (value: import("./context/IntegrationsStore").Session | null) => Promise<void>;
      };
      lan: {
        forget: () => Promise<import("../server/lan-server").LanStatus>;
        get: () => Promise<import("../server/lan-server").LanStatus>;
        set: (enabled: boolean) => Promise<import("../server/lan-server").LanStatus>;
      };
      startup: {
        get: () => Promise<{ supported: boolean; enabled: boolean }>;
        set: (enabled: boolean) => Promise<{ supported: boolean; enabled: boolean }>;
      };
      exportSave: (raw: string) => Promise<{ path: string; files: number; bytes: number } | null>;
      onBeforeClose: (listener: () => Promise<void>) => () => void;
      reminders?: {
        sync: (
          plan: import("./lib/reminders").ReminderPlan,
        ) => Promise<{ supported: boolean }>;
        test: () => Promise<{ ok: boolean; error?: string }>;
        onOpen: (listener: () => void) => () => void;
        onFired: (
          listener: (value: { title: string; message: string }) => void,
        ) => () => void;
      };
      audio?: {
        get: () => Promise<DesktopAudioState>;
        set: (value: {
          volume: number;
          muted: boolean;
        }) => Promise<DesktopAudioState>;
      };
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      fullscreen: () => Promise<void>;
      getState: () => Promise<{
        maximized: boolean;
        fullscreen: boolean;
        focused: boolean;
      }>;
      openDataFolder: () => Promise<void>;
      onState: (
        listener: (state: {
          maximized: boolean;
          fullscreen: boolean;
          focused: boolean;
        }) => void,
      ) => () => void;
    };
  }
}
export interface DesktopAudioState {
  supported: boolean;
  volume: number;
  muted: boolean;
  applied: boolean;
}

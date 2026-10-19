// Windows Core Audio session volume. Only PIDs supplied by Electron are eligible.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class DeviceEnumerator { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, uint stateMask, out IDeviceCollection collection);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IDevice device);
  [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
  [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceCollection {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int Item(uint index, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
  [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr activation, [MarshalAs(UnmanagedType.IUnknown)] out object result);
  [PreserveSig] int OpenPropertyStore(uint access, out IntPtr store);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetState(out uint state);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionManager {
  [PreserveSig] int GetAudioSessionControl(ref Guid session, uint flags, out IntPtr control);
  [PreserveSig] int GetSimpleAudioVolume(ref Guid session, uint flags, out IntPtr volume);
  [PreserveSig] int GetSessionEnumerator(out ISessionEnumerator enumerator);
  [PreserveSig] int RegisterSessionNotification(IntPtr notification);
  [PreserveSig] int UnregisterSessionNotification(IntPtr notification);
  [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr notification);
  [PreserveSig] int UnregisterDuckNotification(IntPtr notification);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionEnumerator {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
}
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionControl {
  [PreserveSig] int GetState(out int state);
  [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
  [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
  [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
  [PreserveSig] int GetGroupingParam(out Guid grouping);
  [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid context);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
  [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
  [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetProcessId(out uint process);
  [PreserveSig] int IsSystemSoundsSession();
  [PreserveSig] int SetDuckingPreference(bool optOut);
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionVolume {
  [PreserveSig] int SetMasterVolume(float level, ref Guid context);
  [PreserveSig] int GetMasterVolume(out float level);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
  [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
}

class AudioControl {
  static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
  [MTAThread]
  static int Main(string[] args) {
    try {
      if (args.Length != 2) throw new ArgumentException();
      float level = -1;
      if (args[0] != "read" && (!float.TryParse(args[0], NumberStyles.Float, CultureInfo.InvariantCulture, out level) || level < 0 || level > 1)) throw new ArgumentException();
      var allowed = new HashSet<uint>();
      foreach (string raw in args[1].Split(',')) { uint id; if (!uint.TryParse(raw, out id) || id == 0) throw new ArgumentException(); allowed.Add(id); }
      var output = new StringBuilder("{\"ok\":true,\"sessions\":[");
      int matches = 0;
      object root = new DeviceEnumerator();
      IDeviceCollection devices = null;
      try {
        Marshal.ThrowExceptionForHR(((IDeviceEnumerator)root).EnumAudioEndpoints(0, 1, out devices));
        uint deviceCount; devices.GetCount(out deviceCount);
        for (uint index = 0; index < deviceCount; index++) {
          IDevice device = null; object manager = null; ISessionEnumerator sessions = null;
          try {
            devices.Item(index, out device);
            Guid iid = typeof(ISessionManager).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out manager));
            ((ISessionManager)manager).GetSessionEnumerator(out sessions);
            int count; sessions.GetCount(out count);
            for (int cursor = 0; cursor < count; cursor++) {
              object session = null;
              try {
                sessions.GetSession(cursor, out session);
                uint pid; ((ISessionControl)session).GetProcessId(out pid);
                if (!allowed.Contains(pid)) continue;
                var volume = (ISessionVolume)session;
                if (level >= 0) { Guid context = Guid.Empty; Marshal.ThrowExceptionForHR(volume.SetMasterVolume(level, ref context)); }
                float actual; Marshal.ThrowExceptionForHR(volume.GetMasterVolume(out actual));
                if (matches++ > 0) output.Append(',');
                output.Append("{\"pid\":").Append(pid).Append(",\"volume\":").Append(actual.ToString("R", CultureInfo.InvariantCulture)).Append('}');
              } finally { Release(session); }
            }
          } catch (COMException) { /* An output device can disappear mid-enumeration. */ }
          finally { Release(sessions); Release(manager); Release(device); }
        }
      } finally { Release(devices); Release(root); }
      Console.WriteLine(output.Append("]}").ToString());
      return 0;
    } catch (Exception error) { Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); Console.WriteLine("{\"ok\":false,\"sessions\":[]}"); return 1; }
  }
}

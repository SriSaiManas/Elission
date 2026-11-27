using System;
using System.Runtime.InteropServices;

public static class AudioControl {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class Enumerator {}
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDeviceEnumerator {
        void EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
        void GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDevice {
        void Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
    }
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IEndpoint {
        void RegisterControlChangeNotify(IntPtr listener);
        void UnregisterControlChangeNotify(IntPtr listener);
        void GetChannelCount(out int count);
        void SetMasterVolumeLevel(float db, ref Guid context);
        void SetMasterVolumeLevelScalar(float value, ref Guid context);
        void GetMasterVolumeLevel(out float db);
        void GetMasterVolumeLevelScalar(out float value);
        void SetChannelVolumeLevel(int channel, float db, ref Guid context);
        void SetChannelVolumeLevelScalar(int channel, float value, ref Guid context);
        void GetChannelVolumeLevel(int channel, out float db);
        void GetChannelVolumeLevelScalar(int channel, out float value);
        void SetMute([MarshalAs(UnmanagedType.Bool)] bool value, ref Guid context);
    }
    private static void WithEndpoint(Action<IEndpoint> operation) {
        var enumerator = (IDeviceEnumerator)new Enumerator();
        IDevice device = null;
        object endpoint = null;
        try {
            enumerator.GetDefaultAudioEndpoint(0, 1, out device);
            var guid = typeof(IEndpoint).GUID;
            device.Activate(ref guid, 23, IntPtr.Zero, out endpoint);
            operation((IEndpoint)endpoint);
        } finally {
            if (endpoint != null) Marshal.ReleaseComObject(endpoint);
            if (device != null) Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(enumerator);
        }
    }
    public static void Volume(int percent) {
        WithEndpoint(endpoint => { var id = Guid.Empty; endpoint.SetMasterVolumeLevelScalar(percent / 100f, ref id); });
    }
    public static void Mute(bool value) {
        WithEndpoint(endpoint => { var id = Guid.Empty; endpoint.SetMute(value, ref id); });
    }
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    public static void Media(byte key) {
        keybd_event(key, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, 2, UIntPtr.Zero);
    }
}

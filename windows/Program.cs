using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Security;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Text;
using System.ComponentModel;
using System.Web.Script.Serialization;

internal static class Program {
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private delegate IntPtr KeyboardCallback(int code, IntPtr message, IntPtr data);
    [StructLayout(LayoutKind.Sequential)]
    private struct Message {
        public IntPtr Window;
        public uint Code;
        public UIntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public int X, Y;
        public uint Reserved;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string module);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int id, KeyboardCallback callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr handle);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr handle, int command);

    private static int Main(string[] args) {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            switch (args[0]) {
                case "keys": Watch(int.Parse(args[1])); break;
                case "voices": Voices(); break;
                case "wake": case "dictation": case "interrupt": Listen(args[0]); break;
                case "speak": Speak(args[1], Read()); break;
                case "system": Console.WriteLine(Execute(Read())); break;
                default: throw new ArgumentException("Unsupported Windows operation.");
            }
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.Message.Replace('\r', ' ').Replace('\n', ' '));
            return 1;
        }
    }

    private static Dictionary<string, object> Read() {
        return Json.Deserialize<Dictionary<string, object>>(Console.In.ReadToEnd());
    }

    private static string Field(Dictionary<string, object> request, string name) {
        return request.TryGetValue(name, out var value) ? Convert.ToString(value, CultureInfo.InvariantCulture) : "";
    }

    private static void Watch(int key) {
        bool down = GetAsyncKeyState(key) < 0;
        KeyboardCallback callback = (code,message,data) => {
            if (code == 0 && Marshal.ReadInt32(data) == key && (Marshal.ReadInt32(data,8) & 16) == 0) {
                int id = message.ToInt32();
                bool isDown = id == 0x100 || id == 0x104;
                bool isUp = id == 0x101 || id == 0x105;
                if ((isDown && !down) || (isUp && down)) {
                    down = isDown;
                    Console.WriteLine(down ? "down" : "up");
                }
            }
            return CallNextHookEx(IntPtr.Zero,code,message,data);
        };
        var hook = SetWindowsHookEx(13,callback,GetModuleHandle(null),0);
        if (hook == IntPtr.Zero) throw new Win32Exception();
        try {
            int result;
            do { result = GetMessage(out _,IntPtr.Zero,0,0); } while (result > 0);
            if (result == -1) throw new Win32Exception();
        } finally {
            UnhookWindowsHookEx(hook);
            GC.KeepAlive(callback);
        }
    }

    private static void Voices() {
        using (var synth = new SpeechSynthesizer()) {
            Console.WriteLine(Json.Serialize(synth.GetInstalledVoices().Where(voice => voice.Enabled).Select(voice => voice.VoiceInfo.Name).ToArray()));
        }
    }

    private static void Listen(string mode) {
        var installed = SpeechRecognitionEngine.InstalledRecognizers();
        var info = installed.FirstOrDefault(item => item.Culture.Name == CultureInfo.CurrentUICulture.Name)
            ?? installed.FirstOrDefault(item => item.Culture.TwoLetterISOLanguageName == "en")
            ?? installed.FirstOrDefault();
        if (info == null) throw new InvalidOperationException("Install a Windows desktop speech recognition language pack.");
        using (var engine = new SpeechRecognitionEngine(info)) {
            if (mode == "dictation") {
                engine.LoadGrammar(new DictationGrammar());
            } else {
                var grammar = new GrammarBuilder { Culture = info.Culture };
                grammar.Append(new Choices(mode == "wake" ? new[] {"Eli","Ellie"} : new[] {"Eli stop","Ellie stop"}));
                engine.LoadGrammar(new Grammar(grammar));
            }
            engine.AudioLevelUpdated += (sender, eventArgs) =>
                Console.Error.WriteLine("level:" + eventArgs.AudioLevel.ToString(CultureInfo.InvariantCulture));
            engine.InitialSilenceTimeout = TimeSpan.FromSeconds(mode == "interrupt" ? 12 : 7);
            engine.EndSilenceTimeout = TimeSpan.FromMilliseconds(600);
            engine.EndSilenceTimeoutAmbiguous = TimeSpan.FromMilliseconds(850);
            engine.SetInputToDefaultAudioDevice();
            Console.Error.WriteLine("ready");
            var result = engine.Recognize();
            if (result != null) Console.WriteLine(Json.Serialize(new {text=result.Text,confidence=result.Confidence}));
        }
    }

    private static void Speak(string filename, Dictionary<string, object> request) {
        using (var synth = new SpeechSynthesizer()) {
            var voice = Field(request,"voice");
            if (voice.Length > 0) synth.SelectVoice(voice);
            else {
                try { synth.SelectVoiceByHints(VoiceGender.Male); } catch (InvalidOperationException) {}
            }
            var rate = int.Parse(Field(request,"rate"));
            var pitch = int.Parse(Field(request,"pitch"));
            var style = Field(request,"style");
            var text = Field(request,"text");
            var start = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + synth.Voice.Culture.Name + "'>";
            var prosody = "<prosody pitch='" + pitch.ToString("+0;-0;0",CultureInfo.InvariantCulture)
                + "%' rate='" + rate.ToString("+0;-0;0",CultureInfo.InvariantCulture)
                + "%' range='" + SecurityElement.Escape(style) + "'>";
            synth.SetOutputToWaveFile(filename);
            try { synth.SpeakSsml(start + prosody + SecurityElement.Escape(text) + "</prosody></speak>"); }
            catch (FormatException) {
                synth.Rate = (int)Math.Round(rate / 10.0);
                synth.Speak(text);
            }
        }
    }

    private static string Execute(Dictionary<string, object> request) {
        var action = Field(request,"action");
        var value = Field(request,"value");
        switch (action) {
            case "status": return Status(value.ToLowerInvariant());
            case "brightness": return Brightness(Percent(value));
            case "volume":
                int volume = Percent(value);
                AudioControl.Volume(volume);
                return "Volume set to " + volume + " percent.";
            case "mute":
                bool mute = value.Equals("mute",StringComparison.OrdinalIgnoreCase);
                AudioControl.Mute(mute);
                return mute ? "Audio muted." : "Audio unmuted.";
            case "media":
                switch (value.ToLowerInvariant()) {
                    case "play": case "pause": AudioControl.Media(179); break;
                    case "next track": AudioControl.Media(176); break;
                    case "previous track": AudioControl.Media(177); break;
                    default: throw new ArgumentException("Unsupported media command.");
                }
                return "Media control sent.";
            case "close": case "switch": return Window(action,value);
            case "move":
                File.Move(Field(request,"source"),Field(request,"destination"));
                return "File moved.";
            default: throw new ArgumentException("Unsupported Windows operation.");
        }
    }

    private static int Percent(string input) {
        if (!int.TryParse(input,out var value) || value < 0 || value > 100) throw new ArgumentException("Choose a value from 0 to 100.");
        return value;
    }

    private static string Window(string action, string name) {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Enter a window title.");
        var aliases = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase) {
            ["Google Chrome"]="chrome",["Microsoft Edge"]="msedge",["Edge"]="msedge",["Calculator"]="CalculatorApp"
        };
        var processName = aliases.TryGetValue(name,out var mapped) ? mapped : name;
        var processes = Process.GetProcesses();
        try {
            var matches = processes.Where(process => process.MainWindowHandle != IntPtr.Zero &&
                (process.ProcessName.Equals(processName,StringComparison.OrdinalIgnoreCase)
                || process.MainWindowTitle.IndexOf(name,StringComparison.OrdinalIgnoreCase) >= 0)).ToArray();
            if (matches.Length != 1) throw new InvalidOperationException("Found " + matches.Length + " matching windows. Use a more specific title.");
            var target = matches[0];
            var title = target.MainWindowTitle;
            if (action == "close") {
                if (!target.CloseMainWindow()) throw new InvalidOperationException("The window did not accept the close request.");
                return "Close requested for " + title + ".";
            }
            if (IsIconic(target.MainWindowHandle)) ShowWindowAsync(target.MainWindowHandle,9);
            if (!SetForegroundWindow(target.MainWindowHandle)) throw new InvalidOperationException("Windows declined the focus change.");
            return "Switched to " + title + ".";
        } finally {
            foreach (var process in processes) process.Dispose();
        }
    }

    private static string Status(string value) {
        if (value == "battery") {
            using (var query = new ManagementObjectSearcher("SELECT EstimatedChargeRemaining FROM Win32_Battery"))
            using (var result = query.Get()) {
                var charges = result.Cast<ManagementObject>().Select(item => Convert.ToString(item["EstimatedChargeRemaining"])).Where(charge => !string.IsNullOrEmpty(charge)).ToArray();
                return charges.Length > 0 ? "Battery charge is " + string.Join(" and ",charges) + " percent." : "Windows reports no battery.";
            }
        }
        if (value == "cpu") {
            using (var query = new ManagementObjectSearcher("SELECT LoadPercentage FROM Win32_Processor"))
            using (var result = query.Get()) {
                var loads = result.Cast<ManagementObject>().Select(item => item["LoadPercentage"]).Where(load => load != null).Select(Convert.ToDouble).ToArray();
                if (loads.Length == 0) throw new InvalidOperationException("Windows did not report CPU utilization.");
                return "CPU utilization is " + Math.Round(loads.Average()) + " percent.";
            }
        }
        using (var query = new ManagementObjectSearcher("SELECT FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem"))
        using (var result = query.Get()) {
            var system = result.Cast<ManagementObject>().First();
            double free = Convert.ToDouble(system["FreePhysicalMemory"]);
            double total = Convert.ToDouble(system["TotalVisibleMemorySize"]);
            return "Memory utilization is " + Math.Round(100 * (1 - free / total)) + " percent.";
        }
    }

    private static string Brightness(int percent) {
        using (var query = new ManagementObjectSearcher(@"root\WMI", "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active=TRUE"))
        using (var result = query.Get()) {
            if (result.Count == 0) throw new InvalidOperationException("This display does not expose Windows brightness controls.");
            foreach (ManagementObject monitor in result) {
                using (monitor)
                using (var inputs = monitor.GetMethodParameters("WmiSetBrightness")) {
                    inputs["Timeout"] = 0u;
                    inputs["Brightness"] = (byte)percent;
                    using (var output = monitor.InvokeMethod("WmiSetBrightness",inputs,null)) {
                        if (Convert.ToUInt32(output["ReturnValue"]) != 0) throw new InvalidOperationException("Windows could not set brightness.");
                    }
                }
            }
        }
        return "Brightness set to " + percent + " percent.";
    }
}

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Web.Script.Serialization;
using NAudio.Wave;
using Vosk;

internal static class Voice {
    internal static void Dictate(string modelDirectory) {
        if (WaveInEvent.DeviceCount == 0) {
            throw new InvalidOperationException("Windows did not report a microphone. Connect one and choose it as the default input.");
        }
        Vosk.Vosk.SetLogLevel(-1);
        var json = new JavaScriptSerializer();
        string ReadText(string payload, string key) {
            var data = json.Deserialize<Dictionary<string, object>>(payload);
            return data.TryGetValue(key,out var value) ? value as string ?? "" : "";
        }

        using (var model = new Model(modelDirectory))
        using (var recognizer = new VoskRecognizer(model,16000f))
        using (var input = new WaveInEvent {DeviceNumber = -1, WaveFormat = new WaveFormat(16000,16,1), BufferMilliseconds = 80})
        using (var completed = new ManualResetEventSlim())
        using (var stopped = new ManualResetEventSlim()) {
            var gate = new object();
            var clock = new Stopwatch();
            string final = "", partial = "";
            Exception failure = null;
            int peak = 0;
            bool sawSpeech = false;
            input.DataAvailable += (sender,args) => {
                lock (gate) {
                    if (completed.IsSet) return;
                    try {
                        double squares = 0;
                        for (int index = 0; index + 1 < args.BytesRecorded; index += 2) {
                            var sample = BitConverter.ToInt16(args.Buffer,index) / 32768d;
                            squares += sample * sample;
                        }
                        int level = (int)Math.Min(100,Math.Sqrt(squares / Math.Max(1,args.BytesRecorded / 2)) * 380);
                        peak = Math.Max(peak,level);
                        Console.Error.WriteLine("level:" + level);
                        if (recognizer.AcceptWaveform(args.Buffer,args.BytesRecorded)) {
                            final = ReadText(recognizer.Result(),"text");
                            if (final.Length > 0) completed.Set();
                        } else {
                            var next = ReadText(recognizer.PartialResult(),"partial");
                            if (next.Length > 0) sawSpeech = true;
                            if (next != partial) {
                                partial = next;
                                Console.Error.WriteLine("partial:" + json.Serialize(partial));
                            }
                        }
                    } catch (Exception error) {
                        failure = error;
                        completed.Set();
                    }
                }
            };
            input.RecordingStopped += (sender,args) => {
                lock (gate) {
                    if (args.Exception != null) failure = args.Exception;
                    stopped.Set();
                    completed.Set();
                }
            };
            try { input.StartRecording(); }
            catch (Exception error) {
                throw new InvalidOperationException("Could not open the default microphone. Check Windows microphone access for desktop apps and the selected input. " + error.Message,error);
            }
            Console.Error.WriteLine("ready");
            clock.Start();
            while (!completed.Wait(200)) {
                lock (gate) {
                    if (clock.Elapsed.TotalSeconds >= (sawSpeech ? 20 : 9)) completed.Set();
                }
            }
            input.StopRecording();
            if (!stopped.Wait(1500)) throw new InvalidOperationException("The microphone did not stop in time.");
            lock (gate) {
                if (failure != null) throw new InvalidOperationException("Windows stopped sending microphone audio. Check the input device and desktop-app microphone access.",failure);
                if (final.Length == 0) final = ReadText(recognizer.FinalResult(),"text");
                if (final.Length > 0) Console.WriteLine(json.Serialize(new {text=final}));
                else Console.WriteLine(json.Serialize(new {message=peak < 2
                    ? "No microphone signal. Check Windows Settings → System → Sound → Input, and allow microphone access for desktop apps."
                    : "I heard audio but couldn’t recognize English speech. Move closer to the microphone and try a short phrase."}));
            }
        }
    }
}

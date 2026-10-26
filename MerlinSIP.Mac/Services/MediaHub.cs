using System.Runtime.InteropServices;
using System.Text;

namespace MerlinSip.Mac;

/// <summary>
/// One microphone and one speaker for the phone. On macOS this is Core Audio
/// AudioQueue at 8 kHz. Elsewhere it emits silence so the SIP session still has a clock.
/// </summary>
public sealed class MediaHub : IDisposable
{
    public const int Rate = 8000;
    public const int FrameSamples = 160;

    private readonly object _gate = new();
    private readonly short[] _remote1 = new short[FrameSamples];
    private readonly short[] _remote2 = new short[FrameSamples];
    private readonly Queue<short[]> _play1 = new();
    private readonly Queue<short[]> _play2 = new();
    private readonly Queue<short> _tones = new();
    private short[] _latestMic = new short[FrameSamples];
    private Timer? _clock;
    private bool _running;
    private bool _audible1 = true;
    private bool _audible2 = true;
    private int _ringPhase;
    private FileStream? _recording;
    private BinaryWriter? _recordingWriter;
    private int _recordingBytes;
    private string? _recordingPath;

    private IntPtr _inputQueue;
    private IntPtr _outputQueue;
    private GCHandle _self;
    private static readonly AudioToolbox.InputCallback InputThunk = OnInput;
    private static readonly AudioToolbox.OutputCallback OutputThunk = OnOutput;

    public float MicVolume { get; set; } = 1;
    public float SpeakerVolume { get; set; } = 1;
    public string InputDeviceId { get; set; } = "default";
    public string OutputDeviceId { get; set; } = "default";
    public bool Conference { get; set; }
    public int FocusLine { get; set; } = 1;
    public bool Ringing { get; set; }
    public string Ringtone { get; set; } = "Classic";
    public string? RecordingPath => _recordingPath;
    public bool IsRecording => _recording != null;

    public event Action<short[]>? MicFrame;

    public void Start()
    {
        lock (_gate)
        {
            if (_running)
            {
                return;
            }

            _running = true;
        }

        RefreshDevices();
        if (OperatingSystem.IsMacOS())
        {
            OpenQueues();
        }

        _clock = new Timer(_ => EmitClock(), null, 20, 20);
    }

    public void RestartDevices()
    {
        if (!OperatingSystem.IsMacOS())
        {
            return;
        }

        CloseQueues();
        OpenQueues();
    }

    public void PushRemote(int line, short[] pcm)
    {
        lock (_gate)
        {
            var slot = line == 2 ? _remote2 : _remote1;
            var count = Math.Min(pcm.Length, slot.Length);
            Array.Clear(slot);
            Array.Copy(pcm, slot, count);
            var copy = new short[FrameSamples];
            Array.Copy(slot, copy, count);
            var queue = line == 2 ? _play2 : _play1;
            queue.Enqueue(copy);
            while (queue.Count > 8)
            {
                queue.Dequeue();
            }
        }
    }

    public void SetLineAudible(int line, bool audible)
    {
        lock (_gate)
        {
            if (line == 2)
            {
                _audible2 = audible;
            }
            else
            {
                _audible1 = audible;
            }
        }
    }

    public short[] LatestRemote(int line)
    {
        lock (_gate)
        {
            var source = line == 2 ? _remote2 : _remote1;
            var copy = new short[FrameSamples];
            Array.Copy(source, copy, FrameSamples);
            return copy;
        }
    }

    public void PlayDigits(string digits)
    {
        foreach (var digit in digits)
        {
            var (low, high) = Dtmf(digit);
            if (low == 0)
            {
                continue;
            }

            EnqueueTone(Tone(low, high, 180));
            EnqueueTone(new short[Rate / 50]);
        }
    }

    public void PlayTestTone() => EnqueueTone(Tone(440, 0, 700));

    public void StartRecording(string path)
    {
        StopRecording();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        _recordingPath = path;
        _recording = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read);
        _recordingWriter = new BinaryWriter(_recording);
        _recordingBytes = 0;
        WriteWavHeader(_recordingWriter, 0);
    }

    public void StopRecording()
    {
        if (_recordingWriter == null || _recording == null)
        {
            return;
        }

        try
        {
            _recording.Position = 0;
            WriteWavHeader(_recordingWriter, _recordingBytes);
            _recordingWriter.Dispose();
        }
        catch (Exception ex)
        {
            DeskLog.Write("Recording close failed: " + ex.Message);
        }

        _recordingWriter = null;
        _recording = null;
    }

    public void RefreshDevices()
    {
        Inputs = AudioToolbox.ListDevices(input: true);
        Outputs = AudioToolbox.ListDevices(input: false);
        Cameras = AudioToolbox.ListCameras();
    }

    public IReadOnlyList<AudioDevice> Inputs { get; private set; } = [new("default", "System default")];
    public IReadOnlyList<AudioDevice> Outputs { get; private set; } = [new("default", "System default")];
    public IReadOnlyList<string> Cameras { get; private set; } = ["Default camera"];

    public void Dispose()
    {
        _running = false;
        _clock?.Dispose();
        StopRecording();
        CloseQueues();
        Ringing = false;
    }

    private void EmitClock()
    {
        if (!_running)
        {
            return;
        }

        short[] frame;
        lock (_gate)
        {
            frame = (short[])_latestMic.Clone();
        }

        Scale(frame, MicVolume);
        try
        {
            MicFrame?.Invoke(frame);
        }
        catch (Exception ex)
        {
            DeskLog.Write("Microphone frame failed: " + ex.Message);
        }
    }

    private void EnqueueTone(short[] samples)
    {
        lock (_gate)
        {
            foreach (var sample in samples)
            {
                _tones.Enqueue(sample);
            }
        }
    }

    private void MixPlayback(byte[] destination)
    {
        var mixed = new short[FrameSamples];
        lock (_gate)
        {
            var play1 = _audible1 && (Conference || FocusLine == 1 || !_audible2);
            var play2 = _audible2 && (Conference || FocusLine == 2 || !_audible1);
            if (play1 && _play1.Count > 0)
            {
                Add(mixed, _play1.Dequeue());
            }

            if (play2 && _play2.Count > 0)
            {
                Add(mixed, _play2.Dequeue());
            }

            if (Ringing)
            {
                Add(mixed, RingFrame());
            }

            for (var i = 0; i < mixed.Length && _tones.Count > 0; i++)
            {
                mixed[i] = Clamp(mixed[i] + _tones.Dequeue());
            }
        }

        Scale(mixed, SpeakerVolume);
        Buffer.BlockCopy(mixed, 0, destination, 0, destination.Length);
        WriteRecording(mixed);
    }

    private short[] RingFrame()
    {
        _ringPhase = (_ringPhase + 1) % 150;
        var on = _ringPhase < 50;
        if (!on)
        {
            return new short[FrameSamples];
        }

        var (f1, f2) = Ringtone switch
        {
            "Soft" => (523.0, 0.0),
            "Bright" => (880.0, 988.0),
            _ => (440.0, 480.0)
        };
        var frame = new short[FrameSamples];
        var start = _ringPhase * FrameSamples;
        for (var i = 0; i < frame.Length; i++)
        {
            var t = (start + i) / (double)Rate;
            var sample = 0.35 * Math.Sin(2 * Math.PI * f1 * t);
            if (f2 > 0)
            {
                sample += 0.25 * Math.Sin(2 * Math.PI * f2 * t);
            }

            frame[i] = (short)(sample * short.MaxValue);
        }

        return frame;
    }

    private void WriteRecording(short[] mixed)
    {
        if (_recordingWriter == null)
        {
            return;
        }

        var bytes = new byte[mixed.Length * 2];
        Buffer.BlockCopy(mixed, 0, bytes, 0, bytes.Length);
        try
        {
            _recordingWriter.Write(bytes);
            _recordingBytes += bytes.Length;
        }
        catch
        {
            StopRecording();
        }
    }

    private void OpenQueues()
    {
        try
        {
            _self = GCHandle.Alloc(this);
            var self = GCHandle.ToIntPtr(_self);
            _outputQueue = AudioToolbox.CreateOutput(OutputThunk, self);
            _inputQueue = AudioToolbox.CreateInput(InputThunk, self);
            AudioToolbox.SelectDevice(_outputQueue, OutputDeviceId);
            AudioToolbox.SelectDevice(_inputQueue, InputDeviceId);
            AudioToolbox.SetVolume(_outputQueue, SpeakerVolume);
            AudioToolbox.PrimeOutput(_outputQueue);
            AudioToolbox.PrimeInput(_inputQueue);
            AudioToolbox.Start(_outputQueue);
            AudioToolbox.Start(_inputQueue);
            DeskLog.Write("Core Audio queues started.");
        }
        catch (Exception ex)
        {
            DeskLog.Write("Core Audio failed, calls will use silence: " + ex.Message);
            CloseQueues();
        }
    }

    private void CloseQueues()
    {
        AudioToolbox.Stop(_inputQueue);
        AudioToolbox.Stop(_outputQueue);
        _inputQueue = IntPtr.Zero;
        _outputQueue = IntPtr.Zero;
        if (_self.IsAllocated)
        {
            _self.Free();
        }
    }

    private static void OnInput(IntPtr user, IntPtr queue, IntPtr buffer, IntPtr startTime, uint packets, IntPtr descriptions)
    {
        var hub = Target(user);
        if (hub != null)
        {
            var pcm = AudioToolbox.ReadBuffer(buffer);
            lock (hub._gate)
            {
                Array.Clear(hub._latestMic);
                var samples = Math.Min(hub._latestMic.Length, pcm.Length);
                Array.Copy(pcm, hub._latestMic, samples);
            }
        }

        AudioToolbox.Enqueue(queue, buffer);
    }

    private static void OnOutput(IntPtr user, IntPtr queue, IntPtr buffer)
    {
        var hub = Target(user);
        var bytes = new byte[FrameSamples * 2];
        hub?.MixPlayback(bytes);
        AudioToolbox.WriteBuffer(buffer, bytes);
        AudioToolbox.Enqueue(queue, buffer);
    }

    private static MediaHub? Target(IntPtr user)
    {
        try
        {
            return GCHandle.FromIntPtr(user).Target as MediaHub;
        }
        catch
        {
            return null;
        }
    }

    public static void Scale(short[] samples, float volume)
    {
        if (Math.Abs(volume - 1f) < 0.01f)
        {
            return;
        }

        for (var i = 0; i < samples.Length; i++)
        {
            samples[i] = Clamp(samples[i] * volume);
        }
    }

    public static void Add(short[] target, short[] extra)
    {
        var count = Math.Min(target.Length, extra.Length);
        for (var i = 0; i < count; i++)
        {
            target[i] = Clamp(target[i] + extra[i]);
        }
    }

    public static short Clamp(double value) => (short)Math.Clamp((int)value, short.MinValue, short.MaxValue);

    public static (double Low, double High) Dtmf(char digit) => char.ToUpperInvariant(digit) switch
    {
        '1' => (697, 1209),
        '2' => (697, 1336),
        '3' => (697, 1477),
        '4' => (770, 1209),
        '5' => (770, 1336),
        '6' => (770, 1477),
        '7' => (852, 1209),
        '8' => (852, 1336),
        '9' => (852, 1477),
        '*' => (941, 1209),
        '0' => (941, 1336),
        '#' => (941, 1477),
        _ => (0, 0)
    };

    public static short[] Tone(double f1, double f2, int milliseconds)
    {
        var count = Rate * milliseconds / 1000;
        var data = new short[count];
        for (var i = 0; i < count; i++)
        {
            var t = i / (double)Rate;
            var sample = 0.35 * Math.Sin(2 * Math.PI * f1 * t);
            if (f2 > 0)
            {
                sample += 0.25 * Math.Sin(2 * Math.PI * f2 * t);
            }

            data[i] = (short)(sample * short.MaxValue);
        }

        return data;
    }

    private static void WriteWavHeader(BinaryWriter writer, int dataBytes)
    {
        writer.Write("RIFF"u8);
        writer.Write(36 + dataBytes);
        writer.Write("WAVE"u8);
        writer.Write("fmt "u8);
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)1);
        writer.Write(Rate);
        writer.Write(Rate * 2);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write("data"u8);
        writer.Write(dataBytes);
    }
}

internal static class AudioToolbox
{
    private const string Toolbox = "/System/Library/Frameworks/AudioToolbox.framework/AudioToolbox";
    private const string CoreAudioLib = "/System/Library/Frameworks/CoreAudio.framework/CoreAudio";
    private const string CoreFoundation = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
    private const string ObjC = "/usr/lib/libobjc.A.dylib";
    private const uint LinearPcm = 0x6C70636D;
    private const uint SignedInteger = 1 << 2;
    private const uint Packed = 1 << 3;
    private const uint Utf8 = 0x08000100;
    private const int Buffers = 4;

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void InputCallback(IntPtr user, IntPtr queue, IntPtr buffer, IntPtr startTime, uint packets, IntPtr descriptions);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void OutputCallback(IntPtr user, IntPtr queue, IntPtr buffer);

    public static IntPtr CreateOutput(OutputCallback callback, IntPtr user)
    {
        var format = Format(MediaHub.Rate);
        var status = AudioQueueNewOutput(ref format, callback, user, IntPtr.Zero, IntPtr.Zero, 0, out var queue);
        if (status != 0)
        {
            throw new InvalidOperationException("Speaker queue failed (" + status + ").");
        }

        return queue;
    }

    public static IntPtr CreateInput(InputCallback callback, IntPtr user)
    {
        var format = Format(MediaHub.Rate);
        var status = AudioQueueNewInput(ref format, callback, user, IntPtr.Zero, IntPtr.Zero, 0, out var queue);
        if (status != 0)
        {
            throw new InvalidOperationException("Microphone queue failed (" + status + "). Grant microphone access in System Settings.");
        }

        return queue;
    }

    public static void PrimeOutput(IntPtr queue)
    {
        var silence = new byte[MediaHub.FrameSamples * 2];
        for (var i = 0; i < Buffers; i++)
        {
            AudioQueueAllocateBuffer(queue, (uint)silence.Length, out var buffer);
            WriteBuffer(buffer, silence);
            Enqueue(queue, buffer);
        }
    }

    public static void PrimeInput(IntPtr queue)
    {
        for (var i = 0; i < Buffers; i++)
        {
            AudioQueueAllocateBuffer(queue, MediaHub.FrameSamples * 2, out var buffer);
            Enqueue(queue, buffer);
        }
    }

    public static void Start(IntPtr queue)
    {
        if (queue != IntPtr.Zero)
        {
            AudioQueueStart(queue, IntPtr.Zero);
        }
    }

    public static void Stop(IntPtr queue)
    {
        if (queue == IntPtr.Zero)
        {
            return;
        }

        try
        {
            AudioQueueStop(queue, 1);
            AudioQueueDispose(queue, 1);
        }
        catch
        {
            // The queue may already be gone.
        }
    }

    public static void Enqueue(IntPtr queue, IntPtr buffer) => AudioQueueEnqueueBuffer(queue, buffer, 0, IntPtr.Zero);

    public static void SetVolume(IntPtr queue, float volume)
    {
        if (queue != IntPtr.Zero)
        {
            AudioQueueSetParameter(queue, 1, Math.Clamp(volume, 0, 1));
        }
    }

    public static void SelectDevice(IntPtr queue, string? uid)
    {
        if (queue == IntPtr.Zero || string.IsNullOrWhiteSpace(uid) || uid == "default")
        {
            return;
        }

        var name = CFStringCreateWithCString(IntPtr.Zero, uid, Utf8);
        if (name == IntPtr.Zero)
        {
            return;
        }

        try
        {
            AudioQueueSetProperty(queue, 0x61716364, ref name, (uint)IntPtr.Size);
        }
        finally
        {
            CFRelease(name);
        }
    }

    public static short[] ReadBuffer(IntPtr buffer)
    {
        var data = Marshal.ReadIntPtr(buffer, 8);
        var size = Marshal.ReadInt32(buffer, 16);
        if (data == IntPtr.Zero || size <= 0)
        {
            return [];
        }

        var bytes = new byte[size];
        Marshal.Copy(data, bytes, 0, size);
        var samples = new short[size / 2];
        Buffer.BlockCopy(bytes, 0, samples, 0, samples.Length * 2);
        return samples;
    }

    public static void WriteBuffer(IntPtr buffer, byte[] bytes)
    {
        var data = Marshal.ReadIntPtr(buffer, 8);
        var capacity = Marshal.ReadInt32(buffer, 0);
        var count = Math.Min(bytes.Length, capacity);
        Marshal.Copy(bytes, 0, data, count);
        Marshal.WriteInt32(buffer, 16, count);
    }

    public static IReadOnlyList<AudioDevice> ListDevices(bool input)
    {
        var devices = new List<AudioDevice> { new("default", "System default") };
        if (!OperatingSystem.IsMacOS())
        {
            return devices;
        }

        try
        {
            var address = new AudioObjectPropertyAddress
            {
                Selector = 0x64657623,
                Scope = 0x676C6F62,
                Element = 0
            };
            var size = 0u;
            if (AudioObjectGetPropertyDataSize(1, ref address, 0, IntPtr.Zero, ref size) != 0 || size < 4)
            {
                return devices;
            }

            var count = (int)(size / 4);
            var ids = new uint[count];
            var handle = GCHandle.Alloc(ids, GCHandleType.Pinned);
            try
            {
                if (AudioObjectGetPropertyData(1, ref address, 0, IntPtr.Zero, ref size, handle.AddrOfPinnedObject()) != 0)
                {
                    return devices;
                }
            }
            finally
            {
                handle.Free();
            }

            foreach (var id in ids)
            {
                if (!HasChannels(id, input))
                {
                    continue;
                }

                var uid = ReadString(id, 0x75696420);
                var name = ReadString(id, 0x6C6E616D);
                if (!string.IsNullOrWhiteSpace(uid) && !string.IsNullOrWhiteSpace(name))
                {
                    devices.Add(new AudioDevice(uid, name));
                }
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("Audio device list failed: " + ex.Message);
        }

        return devices;
    }

    public static IReadOnlyList<string> ListCameras()
    {
        var cameras = new List<string> { "Default camera" };
        if (!OperatingSystem.IsMacOS())
        {
            return cameras;
        }

        try
        {
            var deviceClass = objc_getClass("AVCaptureDevice");
            var utf = Marshal.StringToHGlobalAnsi("vide");
            IntPtr list;
            try
            {
                var text = objc_msgSend(objc_getClass("NSString"), sel_registerName("stringWithUTF8String:"), utf);
                list = objc_msgSend(deviceClass, sel_registerName("devicesWithMediaType:"), text);
            }
            finally
            {
                Marshal.FreeHGlobal(utf);
            }
            var count = (int)objc_msgSend_nint(list, sel_registerName("count"));
            for (var i = 0; i < count; i++)
            {
                var device = objc_msgSend(list, sel_registerName("objectAtIndex:"), (nint)i);
                var name = objc_msgSend(device, sel_registerName("localizedName"));
                var label = Marshal.PtrToStringUTF8(objc_msgSend(name, sel_registerName("UTF8String")));
                if (!string.IsNullOrWhiteSpace(label))
                {
                    cameras.Add(label);
                }
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("Camera list failed: " + ex.Message);
        }

        return cameras;
    }

    private static bool HasChannels(uint device, bool input)
    {
        var address = new AudioObjectPropertyAddress
        {
            Selector = 0x736C6179,
            Scope = input ? 0x696E7074u : 0x6F757470u,
            Element = 0
        };
        var size = 0u;
        if (AudioObjectGetPropertyDataSize(device, ref address, 0, IntPtr.Zero, ref size) != 0 || size < 8)
        {
            return false;
        }

        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (AudioObjectGetPropertyData(device, ref address, 0, IntPtr.Zero, ref size, buffer) != 0)
            {
                return false;
            }

            var buffers = Marshal.ReadInt32(buffer);
            if (buffers <= 0)
            {
                return false;
            }

            return Marshal.ReadInt32(buffer, 8) > 0;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string ReadString(uint device, uint selector)
    {
        var address = new AudioObjectPropertyAddress { Selector = selector, Scope = 0x676C6F62, Element = 0 };
        var size = (uint)IntPtr.Size;
        var value = IntPtr.Zero;
        var holder = GCHandle.Alloc(value, GCHandleType.Pinned);
        try
        {
            if (AudioObjectGetPropertyData(device, ref address, 0, IntPtr.Zero, ref size, holder.AddrOfPinnedObject()) != 0)
            {
                return "";
            }

            value = Marshal.ReadIntPtr(holder.AddrOfPinnedObject());
        }
        finally
        {
            holder.Free();
        }

        if (value == IntPtr.Zero)
        {
            return "";
        }

        var bytes = new byte[512];
        var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        try
        {
            if (!CFStringGetCString(value, pinned.AddrOfPinnedObject(), bytes.Length, Utf8))
            {
                return "";
            }
        }
        finally
        {
            pinned.Free();
            CFRelease(value);
        }

        var end = Array.IndexOf(bytes, (byte)0);
        return Encoding.UTF8.GetString(bytes, 0, end < 0 ? bytes.Length : end);
    }

    private static StreamFormat Format(int rate) => new()
    {
        SampleRate = rate,
        FormatId = LinearPcm,
        FormatFlags = SignedInteger | Packed,
        BytesPerPacket = 2,
        FramesPerPacket = 1,
        BytesPerFrame = 2,
        ChannelsPerFrame = 1,
        BitsPerChannel = 16
    };

    [StructLayout(LayoutKind.Sequential)]
    private struct StreamFormat
    {
        public double SampleRate;
        public uint FormatId;
        public uint FormatFlags;
        public uint BytesPerPacket;
        public uint FramesPerPacket;
        public uint BytesPerFrame;
        public uint ChannelsPerFrame;
        public uint BitsPerChannel;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AudioObjectPropertyAddress
    {
        public uint Selector;
        public uint Scope;
        public uint Element;
    }

    [DllImport(Toolbox)] private static extern int AudioQueueNewOutput(ref StreamFormat format, OutputCallback callback, IntPtr user, IntPtr runLoop, IntPtr mode, uint flags, out IntPtr queue);
    [DllImport(Toolbox)] private static extern int AudioQueueNewInput(ref StreamFormat format, InputCallback callback, IntPtr user, IntPtr runLoop, IntPtr mode, uint flags, out IntPtr queue);
    [DllImport(Toolbox)] private static extern int AudioQueueAllocateBuffer(IntPtr queue, uint size, out IntPtr buffer);
    [DllImport(Toolbox)] private static extern int AudioQueueEnqueueBuffer(IntPtr queue, IntPtr buffer, uint descriptions, IntPtr descriptionPointer);
    [DllImport(Toolbox)] private static extern int AudioQueueStart(IntPtr queue, IntPtr startTime);
    [DllImport(Toolbox)] private static extern int AudioQueueStop(IntPtr queue, byte immediate);
    [DllImport(Toolbox)] private static extern int AudioQueueDispose(IntPtr queue, byte immediate);
    [DllImport(Toolbox)] private static extern int AudioQueueSetParameter(IntPtr queue, uint parameter, float value);
    [DllImport(Toolbox)] private static extern int AudioQueueSetProperty(IntPtr queue, uint property, ref IntPtr value, uint size);
    [DllImport(CoreAudioLib)] private static extern int AudioObjectGetPropertyDataSize(uint device, ref AudioObjectPropertyAddress address, uint qualifierSize, IntPtr qualifier, ref uint dataSize);
    [DllImport(CoreAudioLib)] private static extern int AudioObjectGetPropertyData(uint device, ref AudioObjectPropertyAddress address, uint qualifierSize, IntPtr qualifier, ref uint dataSize, IntPtr data);
    [DllImport(CoreFoundation)] private static extern IntPtr CFStringCreateWithCString(IntPtr allocator, string text, uint encoding);
    [DllImport(CoreFoundation)] private static extern void CFRelease(IntPtr value);
    [DllImport(CoreFoundation)] private static extern bool CFStringGetCString(IntPtr value, IntPtr buffer, int length, uint encoding);
    [DllImport(ObjC)] private static extern IntPtr objc_getClass(string name);
    [DllImport(ObjC)] private static extern IntPtr sel_registerName(string name);
    [DllImport(ObjC, EntryPoint = "objc_msgSend")] private static extern IntPtr objc_msgSend(IntPtr receiver, IntPtr selector);
    [DllImport(ObjC, EntryPoint = "objc_msgSend")] private static extern IntPtr objc_msgSend(IntPtr receiver, IntPtr selector, IntPtr arg);
    [DllImport(ObjC, EntryPoint = "objc_msgSend")] private static extern nint objc_msgSend_nint(IntPtr receiver, IntPtr selector);
}

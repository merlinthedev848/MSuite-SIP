using System.Collections.Concurrent;
using System.Net;
using SIPSorcery.Media;
using SIPSorceryMedia.Abstractions;
using SipAudioFormat = SIPSorceryMedia.Abstractions.AudioFormat;

namespace MerlinSip.Mobile;

/// <summary>
/// Microphone and earpiece endpoint for SIPSorcery. Captures 20 ms G.711 frames
/// and plays decoded PCM through the voice-call audio path.
/// </summary>
public sealed class AndroidAudioEndPoint : IAudioEndPoint
{
    private const int SampleRate = 8000;
    private const int FrameSamples = 160;

    private readonly IAudioEncoder _encoder;
    private readonly MediaFormatManager<SipAudioFormat> _formats;
    private readonly global::Android.Content.Context _context;
    private readonly ConcurrentQueue<byte[]> _playback = new();
    private readonly object _deviceGate = new();

    private global::Android.Media.AudioRecord? _recorder;
    private global::Android.Media.AudioTrack? _player;
    private Thread? _captureThread;
    private Thread? _playbackThread;
    private volatile bool _captureRun;
    private volatile bool _playbackRun;
    private volatile bool _paused;
    private volatile bool _closed;
    private bool _encodedSeen;
    private int _captureRate = SampleRate;
    private int _playbackRate = SampleRate;
    private int _receivedPackets;

    public bool Muted { get; set; }
    public int ReceivedPackets => _receivedPackets;

    public event EncodedSampleDelegate? OnAudioSourceEncodedSample;
    public event Action<EncodedAudioFrame>? OnAudioSourceEncodedFrameReady;
    public event RawAudioSampleDelegate? OnAudioSourceRawSample { add { } remove { } }
    public event SourceErrorDelegate? OnAudioSourceError;
    public event SourceErrorDelegate? OnAudioSinkError;

    public AndroidAudioEndPoint(global::Android.Content.Context context, IAudioEncoder encoder)
    {
        _context = context.ApplicationContext!;
        _encoder = encoder;
        _formats = new MediaFormatManager<SipAudioFormat>(encoder.SupportedFormats);
    }

    public void RestrictFormats(Func<SipAudioFormat, bool> filter) => _formats.RestrictFormats(filter);
    public List<SipAudioFormat> GetAudioSourceFormats() => _formats.GetSourceFormats();
    public List<SipAudioFormat> GetAudioSinkFormats() => _formats.GetSourceFormats();
    public bool HasEncodedAudioSubscribers() => OnAudioSourceEncodedSample != null || OnAudioSourceEncodedFrameReady != null;
    public bool IsAudioSourcePaused() => _paused;
    public void ExternalAudioSourceRawSample(AudioSamplingRatesEnum samplingRate, uint durationMilliseconds, short[] sample) { }

    public void SetAudioSourceFormat(SipAudioFormat audioFormat) => _formats.SetSelectedFormat(audioFormat);
    public void SetAudioSinkFormat(SipAudioFormat audioFormat) => _formats.SetSelectedFormat(audioFormat);

    public MediaEndPoints ToMediaEndPoints() => new()
    {
        AudioSource = this,
        AudioSink = this
    };

    public Task Start()
    {
        StartAudio();
        StartAudioSink();
        return Task.CompletedTask;
    }

    public Task Close()
    {
        CloseAudio();
        CloseAudioSink();
        return Task.CompletedTask;
    }

    public Task Pause() => PauseAudio();
    public Task Resume() => ResumeAudio();

    public Task StartAudio()
    {
        if (_captureRun || _closed)
        {
            return Task.CompletedTask;
        }

        try
        {
            _recorder = OpenRecorder();
            _recorder.StartRecording();
            _captureRun = true;
            _captureThread = new Thread(CaptureLoop)
            {
                IsBackground = true,
                Name = "MerlinMic"
            };
            _captureThread.Start();
        }
        catch (Exception ex)
        {
            OnAudioSourceError?.Invoke("Microphone failed. " + ex.Message);
        }

        return Task.CompletedTask;
    }

    public Task CloseAudio()
    {
        _captureRun = false;
        _closed = true;
        lock (_deviceGate)
        {
            try
            {
                _recorder?.Stop();
            }
            catch
            {
                // The recorder may already be stopped.
            }

            _recorder?.Release();
            _recorder = null;
        }

        return Task.CompletedTask;
    }

    public Task PauseAudio()
    {
        _paused = true;
        return Task.CompletedTask;
    }

    public Task ResumeAudio()
    {
        _paused = false;
        return Task.CompletedTask;
    }

    public Task StartAudioSink()
    {
        if (_playbackRun)
        {
            return Task.CompletedTask;
        }

        _playbackRun = true;
        _playbackThread = new Thread(PlaybackLoop)
        {
            IsBackground = true,
            Name = "MerlinSpeaker"
        };
        _playbackThread.Start();
        return Task.CompletedTask;
    }

    public Task CloseAudioSink()
    {
        _playbackRun = false;
        lock (_deviceGate)
        {
            try
            {
                _player?.Stop();
            }
            catch
            {
                // The track may already be stopped.
            }

            _player?.Release();
            _player = null;
        }

        return Task.CompletedTask;
    }

    public Task PauseAudioSink() => Task.CompletedTask;
    public Task ResumeAudioSink() => Task.CompletedTask;

    public void GotAudioRtp(IPEndPoint remoteEndPoint, uint ssrc, uint seqnum, uint timestamp, int payloadId, bool marker, byte[] payload)
    {
        if (payload.Length > 0)
        {
            Interlocked.Increment(ref _receivedPackets);
        }

        if (_encodedSeen || payload.Length == 0 || _formats.SelectedFormat.IsEmpty())
        {
            return;
        }

        PlayFrame(payload, _formats.SelectedFormat);
    }

    public void GotEncodedMediaFrame(EncodedAudioFrame encodedMediaFrame)
    {
        _encodedSeen = true;
        if (encodedMediaFrame.EncodedAudio.Length > 0)
        {
            Interlocked.Increment(ref _receivedPackets);
        }

        if (encodedMediaFrame.EncodedAudio.Length == 0 || encodedMediaFrame.AudioFormat.IsEmpty())
        {
            return;
        }

        PlayFrame(encodedMediaFrame.EncodedAudio, encodedMediaFrame.AudioFormat);
    }

    private void PlayFrame(byte[] encoded, SipAudioFormat format)
    {
        try
        {
            var pcm = _encoder.DecodeAudio(encoded, format);
            if (pcm.Length == 0)
            {
                return;
            }

            var bytes = new byte[pcm.Length * sizeof(short)];
            Buffer.BlockCopy(pcm, 0, bytes, 0, bytes.Length);
            _playback.Enqueue(bytes);
            while (_playback.Count > 12 && _playback.TryDequeue(out _))
            {
            }
        }
        catch (Exception ex)
        {
            OnAudioSinkError?.Invoke("Playback decode failed. " + ex.Message);
        }
    }

    private void CaptureLoop()
    {
        var buffer = new short[FrameSamples * 4];
        var pending = new List<short>(FrameSamples * 2);
        while (_captureRun)
        {
            global::Android.Media.AudioRecord? recorder;
            lock (_deviceGate)
            {
                recorder = _recorder;
            }

            if (recorder == null)
            {
                break;
            }

            int read;
            try
            {
                read = recorder.Read(buffer, 0, buffer.Length);
            }
            catch
            {
                break;
            }

            if (read <= 0)
            {
                continue;
            }

            if (_captureRate == SampleRate)
            {
                for (var i = 0; i < read; i++)
                {
                    pending.Add(buffer[i]);
                }
            }
            else
            {
                for (var i = 0; i + 1 < read; i += 2)
                {
                    pending.Add((short)((buffer[i] + buffer[i + 1]) / 2));
                }
            }

            while (pending.Count >= FrameSamples)
            {
                var frame = pending.GetRange(0, FrameSamples).ToArray();
                pending.RemoveRange(0, FrameSamples);
                Emit(frame);
            }
        }
    }

    private void Emit(short[] pcm)
    {
        if (_paused || _formats.SelectedFormat.IsEmpty())
        {
            return;
        }

        if (Muted)
        {
            Array.Clear(pcm);
        }

        try
        {
            var encoded = _encoder.EncodeAudio(pcm, _formats.SelectedFormat);
            OnAudioSourceEncodedSample?.Invoke((uint)pcm.Length, encoded);
            OnAudioSourceEncodedFrameReady?.Invoke(new EncodedAudioFrame(
                0,
                _formats.SelectedFormat,
                (uint)(pcm.Length * 1000 / SampleRate),
                encoded));
        }
        catch (Exception ex)
        {
            OnAudioSourceError?.Invoke("Microphone encode failed. " + ex.Message);
        }
    }

    private void PlaybackLoop()
    {
        while (_playbackRun)
        {
            if (!_playback.TryDequeue(out var frame))
            {
                Thread.Sleep(10);
                continue;
            }

            try
            {
                var player = EnsurePlayer();
                if (player == null)
                {
                    continue;
                }

                if (_playbackRate == SampleRate)
                {
                    player.Write(frame, 0, frame.Length);
                }
                else
                {
                    var up = new byte[frame.Length * 2];
                    for (var i = 0; i < frame.Length; i += 2)
                    {
                        up[i * 2] = frame[i];
                        up[i * 2 + 1] = frame[i + 1];
                        up[i * 2 + 2] = frame[i];
                        up[i * 2 + 3] = frame[i + 1];
                    }

                    player.Write(up, 0, up.Length);
                }
            }
            catch (Exception ex)
            {
                OnAudioSinkError?.Invoke("Speaker failed. " + ex.Message);
            }
        }
    }

    private global::Android.Media.AudioRecord OpenRecorder()
    {
        foreach (var rate in new[] { SampleRate, 16000 })
        {
            var min = global::Android.Media.AudioRecord.GetMinBufferSize(
                rate,
                global::Android.Media.ChannelIn.Mono,
                global::Android.Media.Encoding.Pcm16bit);
            if (min <= 0)
            {
                continue;
            }

            var recorder = new global::Android.Media.AudioRecord(
                global::Android.Media.AudioSource.VoiceCommunication,
                rate,
                global::Android.Media.ChannelIn.Mono,
                global::Android.Media.Encoding.Pcm16bit,
                Math.Max(min, rate / 5 * 2));
            if (recorder.State == global::Android.Media.State.Initialized)
            {
                _captureRate = rate;
                return recorder;
            }

            recorder.Release();
        }

        throw new InvalidOperationException("This device has no 8 kHz or 16 kHz microphone format.");
    }

    private global::Android.Media.AudioTrack? EnsurePlayer()
    {
        lock (_deviceGate)
        {
            if (_player != null)
            {
                return _player;
            }

            foreach (var rate in new[] { SampleRate, 16000 })
            {
                var min = global::Android.Media.AudioTrack.GetMinBufferSize(
                    rate,
                    global::Android.Media.ChannelOut.Mono,
                    global::Android.Media.Encoding.Pcm16bit);
                if (min <= 0)
                {
                    continue;
                }

                var format = new global::Android.Media.AudioFormat.Builder()
                    .SetSampleRate(rate)!
                    .SetEncoding(global::Android.Media.Encoding.Pcm16bit)!
                    .SetChannelMask(global::Android.Media.ChannelOut.Mono)!
                    .Build();
                var attributes = new global::Android.Media.AudioAttributes.Builder()
                    .SetUsage(global::Android.Media.AudioUsageKind.VoiceCommunication)!
                    .SetContentType(global::Android.Media.AudioContentType.Speech)!
                    .Build();
                if (format == null || attributes == null)
                {
                    continue;
                }

                var track = new global::Android.Media.AudioTrack.Builder()
                    .SetAudioAttributes(attributes)!
                    .SetAudioFormat(format)!
                    .SetBufferSizeInBytes(Math.Max(min, rate / 5 * 2))!
                    .SetTransferMode(global::Android.Media.AudioTrackMode.Stream)!
                    .Build();
                if (track.State == global::Android.Media.AudioTrackState.Initialized)
                {
                    track.Play();
                    _player = track;
                    _playbackRate = rate;
                    return track;
                }

                track.Release();
            }
        }

        OnAudioSinkError?.Invoke("This device could not open a voice playback track.");
        return null;
    }
}

using System.Net;
using SIPSorcery.Media;
using SIPSorceryMedia.Abstractions;
using SipAudioFormat = SIPSorceryMedia.Abstractions.AudioFormat;

namespace MerlinSip.Mac;

public sealed class MacAudioEndPoint : IAudioEndPoint
{
    private readonly int _line;
    private readonly int _otherLine;
    private readonly MediaHub _hub;
    private readonly IAudioEncoder _encoder;
    private readonly MediaFormatManager<SipAudioFormat> _formats;
    private bool _paused;
    private bool _closed;
    private bool _encodedSeen;
    private uint _lastTimestamp;
    private int _lastSeq = -1;

    public MacAudioEndPoint(int line, MediaHub hub, IAudioEncoder encoder)
    {
        _line = line;
        _otherLine = line == 1 ? 2 : 1;
        _hub = hub;
        _encoder = encoder;
        _formats = new MediaFormatManager<SipAudioFormat>(encoder.SupportedFormats);
    }

    public bool Muted { get; set; }
    public bool ConferenceMix { get; set; }
    public long PacketsSent { get; private set; }
    public long PacketsReceived { get; private set; }
    public long PacketsLost { get; private set; }
    public double JitterMs { get; private set; }

    public double LossPercent => PacketsReceived + PacketsLost == 0
        ? 0
        : PacketsLost * 100.0 / (PacketsReceived + PacketsLost);

    public double Mos
    {
        get
        {
            var r = 93.2 - (LossPercent * 2.5) - (JitterMs / 8.0);
            r = Math.Clamp(r, 0, 100);
            var mos = 1 + (0.035 * r) + (r * (r - 60) * (100 - r) * 0.000007);
            return Math.Clamp(mos, 1, 4.5);
        }
    }

    public string Codec => _formats.SelectedFormat.IsEmpty() ? "" : _formats.SelectedFormat.Codec.ToString();

    public event EncodedSampleDelegate? OnAudioSourceEncodedSample;
    public event Action<EncodedAudioFrame>? OnAudioSourceEncodedFrameReady;
    public event RawAudioSampleDelegate? OnAudioSourceRawSample { add { } remove { } }
    public event SourceErrorDelegate? OnAudioSourceError;
    public event SourceErrorDelegate? OnAudioSinkError;

    public void RestrictFormats(Func<SipAudioFormat, bool> filter) => _formats.RestrictFormats(filter);
    public List<SipAudioFormat> GetAudioSourceFormats() => _formats.GetSourceFormats();
    public List<SipAudioFormat> GetAudioSinkFormats() => _formats.GetSourceFormats();
    public void SetAudioSourceFormat(SipAudioFormat audioFormat) => _formats.SetSelectedFormat(audioFormat);
    public void SetAudioSinkFormat(SipAudioFormat audioFormat) => _formats.SetSelectedFormat(audioFormat);
    public bool HasEncodedAudioSubscribers() => OnAudioSourceEncodedSample != null || OnAudioSourceEncodedFrameReady != null;
    public bool IsAudioSourcePaused() => _paused;
    public void ExternalAudioSourceRawSample(AudioSamplingRatesEnum samplingRate, uint durationMilliseconds, short[] sample) { }

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
        _closed = false;
        _hub.MicFrame += OnMic;
        _hub.SetLineAudible(_line, true);
        return Task.CompletedTask;
    }

    public Task CloseAudio()
    {
        _closed = true;
        _hub.MicFrame -= OnMic;
        _hub.SetLineAudible(_line, false);
        return Task.CompletedTask;
    }

    public Task PauseAudio()
    {
        _paused = true;
        _hub.SetLineAudible(_line, false);
        return Task.CompletedTask;
    }

    public Task ResumeAudio()
    {
        _paused = false;
        _hub.SetLineAudible(_line, true);
        return Task.CompletedTask;
    }

    public Task StartAudioSink() => Task.CompletedTask;
    public Task CloseAudioSink() => Task.CompletedTask;
    public Task PauseAudioSink() => Task.CompletedTask;
    public Task ResumeAudioSink() => Task.CompletedTask;

    public void GotAudioRtp(IPEndPoint remoteEndPoint, uint ssrc, uint seqnum, uint timestamp, int payloadId, bool marker, byte[] payload)
    {
        NotePacket((int)seqnum, timestamp);
        if (_encodedSeen || payload.Length == 0 || _formats.SelectedFormat.IsEmpty())
        {
            return;
        }

        Play(payload, _formats.SelectedFormat);
    }

    public void GotEncodedMediaFrame(EncodedAudioFrame encodedMediaFrame)
    {
        _encodedSeen = true;
        if (encodedMediaFrame.EncodedAudio.Length == 0 || encodedMediaFrame.AudioFormat.IsEmpty())
        {
            return;
        }

        Play(encodedMediaFrame.EncodedAudio, encodedMediaFrame.AudioFormat);
    }

    private void OnMic(short[] frame)
    {
        if (_closed || _paused || _formats.SelectedFormat.IsEmpty())
        {
            return;
        }

        var pcm = (short[])frame.Clone();
        if (Muted)
        {
            Array.Clear(pcm);
        }
        else if (ConferenceMix)
        {
            MediaHub.Add(pcm, _hub.LatestRemote(_otherLine));
        }

        try
        {
            var encoded = _encoder.EncodeAudio(pcm, _formats.SelectedFormat);
            PacketsSent++;
            OnAudioSourceEncodedSample?.Invoke((uint)pcm.Length, encoded);
            OnAudioSourceEncodedFrameReady?.Invoke(new EncodedAudioFrame(
                0,
                _formats.SelectedFormat,
                (uint)(pcm.Length * 1000 / MediaHub.Rate),
                encoded));
        }
        catch (Exception ex)
        {
            OnAudioSourceError?.Invoke("Microphone encode failed. " + ex.Message);
        }
    }

    private void Play(byte[] encoded, SipAudioFormat format)
    {
        try
        {
            var pcm = _encoder.DecodeAudio(encoded, format);
            if (pcm.Length == 0 || _paused)
            {
                return;
            }

            _hub.PushRemote(_line, pcm);
        }
        catch (Exception ex)
        {
            OnAudioSinkError?.Invoke("Playback decode failed. " + ex.Message);
        }
    }

    private void NotePacket(int seq, uint timestamp)
    {
        PacketsReceived++;
        if (_lastSeq >= 0)
        {
            var expected = (_lastSeq + 1) & 0xFFFF;
            if (seq != expected)
            {
                var gap = (seq - expected) & 0xFFFF;
                if (gap < 200)
                {
                    PacketsLost += gap;
                }
            }

            var delta = Math.Abs((int)timestamp - (int)_lastTimestamp);
            var drift = Math.Abs(delta - MediaHub.FrameSamples);
            JitterMs += ((drift / 8.0) - JitterMs) / 16.0;
        }

        _lastSeq = seq;
        _lastTimestamp = timestamp;
    }
}

using System.Runtime.InteropServices;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class RingtonePlayer : IDisposable
{
    private const int SampleRate = 44100;

    public static readonly IReadOnlyList<RingtoneChoice> Choices =
    [
        new("orbital-anthem", "🚀 Orbital Dance (Trance Peak)"),
        new("teams-anthem", "✨ Teams Modern Remix (Upbeat Earworm)"),
        new("skype-spark", "🌟 Skype Spark Dynamic (Melodic Chime)"),
        new("merlin-anthem", "🔥 Merlin Signature Anthem (Banging Hook)"),
        new("cyberpunk", "⚡ Cyberpunk Overdrive (Drop)"),
        new("miami-midnight", "🌴 Miami Midnight 1984 (Synthwave)"),
        new("tokyo-drift", "🏎️ Tokyo Drift (Electro Bass)"),
        new("neon-funk", "🎷 Neon Funk Fusion (Slap Bass)"),
        new("matrix-tech", "🕶️ Matrix Tech (Club Drop)")
    ];

    private readonly List<AudioBuffer> _buffers = [];
    private readonly object _sync = new();
    private CancellationTokenSource? _cancellation;
    private IntPtr _waveOut;
    private string _ringtone = AppStartupConfig.DefaultRingtone;
    private double _volume = 1.0;

    public void StartUkRingback(MediaDeviceInfo outputDevice, double volume = 1.0)
    {
        Start(outputDevice, "uk-ringback", volume, allowHiddenTone: true);
    }

    public void Start(MediaDeviceInfo outputDevice, string? ringtone = null, double volume = 1.0)
    {
        Start(outputDevice, ringtone, volume, allowHiddenTone: false);
    }

    private void Start(MediaDeviceInfo outputDevice, string? ringtone, double volume, bool allowHiddenTone)
    {
        Stop();
        _ringtone = Choices.Any(choice => choice.Id == ringtone) || (allowHiddenTone && ringtone == "uk-ringback")
            ? ringtone!
            : Choices[0].Id;
        _volume = Math.Clamp(volume, 0.25, 2.0);

        var format = WaveFormat.Pcm16Mono44k();
        var deviceId = int.TryParse(outputDevice.Id, out var parsed) ? parsed : -1;
        var result = WinMm.waveOutOpen(out _waveOut, deviceId, ref format, IntPtr.Zero, IntPtr.Zero, 0);
        if (result != 0)
        {
            DebugLog.Write($"RINGTONE open failed device={outputDevice.Name} result={result}");
            return;
        }

        DebugLog.Write($"RINGTONE start device={outputDevice.Name} tone={_ringtone}");
        _cancellation = new CancellationTokenSource();
        _ = Task.Run(() => PlayLoopAsync(_cancellation.Token));
    }

    public void Stop()
    {
        _cancellation?.Cancel();
        _cancellation?.Dispose();
        _cancellation = null;

        lock (_sync)
        {
            if (_waveOut != IntPtr.Zero)
            {
                WinMm.waveOutReset(_waveOut);

                foreach (var buffer in _buffers)
                {
                    WinMm.waveOutUnprepareHeader(_waveOut, buffer.HeaderPointer, Marshal.SizeOf<WaveHeader>());
                }

                WinMm.waveOutClose(_waveOut);
                _waveOut = IntPtr.Zero;
                DebugLog.Write("RINGTONE stop");
            }

            foreach (var buffer in _buffers)
            {
                buffer.Dispose();
            }

            _buffers.Clear();
        }
    }

    public void Dispose()
    {
        Stop();
    }

    private async Task PlayLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                IntPtr waveOut;
                lock (_sync)
                {
                    waveOut = _waveOut;
                }

                if (waveOut == IntPtr.Zero)
                {
                    break;
                }

                var pause = PlayPattern();
                try
                {
                    await Task.Delay(pause, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                TrimBuffers();
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write($"RINGTONE play loop error: {ex.Message}");
        }
    }

    private int PlayPattern()
    {
        switch (_ringtone)
        {
            case "uk-ringback":
                Repeat(4, () =>
                {
                    QueueToneStep(0.40, [400.00, 450.00], null, Percussion.None, 0.10);
                    QueuePause(0.20);
                    QueueToneStep(0.40, [400.00, 450.00], null, Percussion.None, 0.10);
                    QueuePause(2.00);
                });
                return 12000;

            case "teams-anthem":
                PlayGroove(126, GrooveFeel.TeamsRemix, [
                    Chord([130.81, 196.00, 261.63, 329.63, 392.00, 493.88], [783.99, 1046.50, 1318.51]),
                    Chord([110.00, 164.81, 220.00, 261.63, 329.63, 392.00], [880.00, 1046.50, 1318.51]),
                    Chord([87.31, 130.81, 174.61, 220.00, 261.63, 329.63], [698.46, 880.00, 1046.50]),
                    Chord([98.00, 146.83, 196.00, 246.94, 293.66, 349.23], [783.99, 987.77, 1174.66])
                ]);
                return 7600;

            case "skype-spark":
                PlayGroove(125, GrooveFeel.SkypeSpark, [
                    Chord([146.83, 220.00, 293.66, 369.99, 440.00, 554.37], [739.99, 1108.73, 1479.98]),
                    Chord([123.47, 185.00, 246.94, 293.66, 369.99, 440.00], [587.33, 739.99, 1174.66]),
                    Chord([98.00, 146.83, 196.00, 246.94, 293.66, 369.99], [783.99, 987.77, 1174.66]),
                    Chord([110.00, 164.81, 220.00, 277.18, 329.63, 440.00], [880.00, 1108.73, 1318.51])
                ]);
                return 7700;

            case "merlin-anthem":
                PlayGroove(128, GrooveFeel.MerlinAnthem, [
                    Chord([130.81, 196.00, 261.63, 329.63, 392.00, 523.25], [659.25, 1046.50, 1318.51]),
                    Chord([146.83, 220.00, 293.66, 369.99, 440.00, 587.33], [739.99, 1174.66, 1479.98]),
                    Chord([164.81, 246.94, 329.63, 392.00, 493.88, 659.25], [783.99, 1318.51, 1567.98]),
                    Chord([146.83, 220.00, 293.66, 392.00, 493.88, 587.33], [783.99, 1174.66, 1479.98])
                ]);
                return 7500;

            case "cyberpunk":
                PlayGroove(130, GrooveFeel.Cyberpunk, [
                    Chord([146.83, 220.00, 261.63, 293.66, 349.23, 440.00], [587.33, 880.00, 1174.66]),
                    Chord([174.61, 261.63, 329.63, 349.23, 440.00, 523.25], [698.46, 1046.50, 1396.91]),
                    Chord([130.81, 196.00, 261.63, 329.63, 392.00, 493.88], [587.33, 987.77, 1174.66]),
                    Chord([116.54, 174.61, 233.08, 293.66, 349.23, 440.00], [698.46, 880.00, 1396.91])
                ]);
                return 7400;

            case "miami-midnight":
                PlayGroove(122, GrooveFeel.Synthwave, [
                    Chord([110.00, 220.00, 261.63, 329.63, 440.00], [659.25, 880.00, 1318.51]),
                    Chord([87.31, 174.61, 261.63, 329.63, 349.23], [698.46, 1046.50, 1396.91]),
                    Chord([130.81, 196.00, 261.63, 329.63, 392.00], [659.25, 987.77, 1318.51]),
                    Chord([98.00, 196.00, 246.94, 293.66, 392.00], [587.33, 783.99, 1174.66])
                ]);
                return 7800;

            case "tokyo-drift":
                PlayGroove(132, GrooveFeel.ElectroBass, [
                    Chord([164.81, 246.94, 329.63, 392.00, 493.88], [659.25, 987.77, 1318.51]),
                    Chord([130.81, 261.63, 329.63, 392.00, 523.25], [659.25, 1046.50, 1318.51]),
                    Chord([146.83, 293.66, 369.99, 440.00, 587.33], [739.99, 1174.66, 1479.98]),
                    Chord([123.47, 246.94, 293.66, 369.99, 493.88], [587.33, 987.77, 1174.66])
                ]);
                return 7300;

            case "neon-funk":
                PlayGroove(122, GrooveFeel.FunkFusion, [
                    Chord([155.56, 233.08, 277.18, 311.13, 369.99, 466.16], [622.25, 932.33, 1244.51]),
                    Chord([103.83, 207.65, 261.63, 311.13, 369.99, 415.30], [523.25, 830.61, 1046.50]),
                    Chord([138.59, 207.65, 277.18, 329.63, 415.30, 523.25], [659.25, 830.61, 1046.50]),
                    Chord([116.54, 233.08, 293.66, 349.23, 466.16, 587.33], [587.33, 932.33, 1174.66])
                ]);
                return 7800;

            case "matrix-tech":
                PlayGroove(128, GrooveFeel.MatrixTech, [
                    Chord([196.00, 293.66, 349.23, 392.00, 466.16], [783.99, 1174.66, 1567.98]),
                    Chord([233.08, 293.66, 349.23, 466.16, 587.33], [698.46, 1174.66, 1396.91]),
                    Chord([174.61, 261.63, 349.23, 440.00, 523.25], [698.46, 1046.50, 1396.91]),
                    Chord([155.56, 233.08, 311.13, 392.00, 466.16], [622.25, 932.33, 1244.51])
                ]);
                return 7500;

            case "orbital-anthem":
            default:
                PlayGroove(128, GrooveFeel.TranceAnthem, [
                    Chord([185.00, 277.18, 369.99, 440.00, 554.37], [739.99, 1108.73, 1479.98]),
                    Chord([146.83, 293.66, 369.99, 440.00, 587.33], [739.99, 1174.66, 1479.98]),
                    Chord([110.00, 220.00, 277.18, 329.63, 440.00], [659.25, 880.00, 1318.51]),
                    Chord([164.81, 246.94, 329.63, 415.30, 493.88], [659.25, 830.61, 1318.51])
                ]);
                return 7500;
        }
    }

    private void PlayGroove(int bpm, GrooveFeel feel, GrooveChord[] progression)
    {
        var stepSeconds = 60.0 / bpm / 2.0;
        for (var bar = 0; bar < progression.Length; bar++)
        {
            var chord = progression[bar];
            for (var step = 0; step < 8; step++)
            {
                var percussion = GetPercussion(feel, bar, step);
                var pad = GetPadNotes(feel, chord, step);
                var pluck = GetHookNotes(feel, chord, bar, step);
                var bass = GetBassNote(feel, chord, step);

                QueueGrooveStep(stepSeconds, pad, pluck, bass, percussion, feel);
            }
        }
    }

    private static Percussion GetPercussion(GrooveFeel feel, int bar, int step)
    {
        return feel switch
        {
            GrooveFeel.TranceAnthem => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                2 or 6 => Percussion.Kick | Percussion.Snare | Percussion.Clap | Percussion.Hat,
                _ => Percussion.Hat | Percussion.GhostHat
            },
            GrooveFeel.TeamsRemix => step switch
            {
                0 => Percussion.Kick | Percussion.Hat,
                1 => Percussion.Hat | Percussion.GhostHat,
                2 => Percussion.Clap | Percussion.Snare | Percussion.Hat,
                3 => Percussion.Kick | Percussion.GhostHat,
                4 => Percussion.Kick | Percussion.Hat,
                5 => Percussion.Hat | Percussion.GhostHat,
                6 => Percussion.Clap | Percussion.Snare | Percussion.Hat,
                _ => Percussion.Kick | Percussion.GhostHat
            },
            GrooveFeel.SkypeSpark => step switch
            {
                0 => Percussion.Kick | Percussion.Hat,
                1 => Percussion.Hat | Percussion.GhostHat,
                2 => Percussion.Snare | Percussion.Clap | Percussion.Hat,
                3 => Percussion.GhostHat,
                4 => Percussion.Kick | Percussion.Hat,
                5 => Percussion.Hat | Percussion.GhostHat,
                6 => Percussion.Snare | Percussion.Clap | Percussion.Hat,
                _ => Percussion.GhostHat
            },
            GrooveFeel.MerlinAnthem => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                1 or 5 => Percussion.Hat | Percussion.GhostHat,
                2 or 6 => Percussion.Kick | Percussion.Snare | Percussion.Clap | Percussion.Hat,
                3 => Percussion.Kick | Percussion.GhostHat,
                _ => Percussion.Hat | Percussion.GhostHat
            },
            GrooveFeel.Cyberpunk => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                2 or 6 => Percussion.Kick | Percussion.Snare | Percussion.Clap | Percussion.Hat,
                _ => Percussion.GhostHat | Percussion.Hat
            },
            GrooveFeel.Synthwave => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                2 or 6 => Percussion.Snare | Percussion.Clap | Percussion.Hat,
                _ => Percussion.Hat | Percussion.GhostHat
            },
            GrooveFeel.ElectroBass => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                2 or 6 => Percussion.Kick | Percussion.Snare | Percussion.Clap,
                3 => Percussion.Kick | Percussion.GhostHat,
                _ => Percussion.GhostHat | Percussion.Hat
            },
            GrooveFeel.FunkFusion => step switch
            {
                0 => Percussion.Kick | Percussion.Hat,
                1 => Percussion.Hat | Percussion.GhostHat,
                2 => Percussion.Snare | Percussion.Clap | Percussion.Hat,
                3 => Percussion.Kick | Percussion.GhostHat,
                4 => Percussion.Kick | Percussion.Hat,
                5 => Percussion.Kick | Percussion.GhostHat,
                6 => Percussion.Snare | Percussion.Clap | Percussion.Hat,
                _ => Percussion.Hat | Percussion.GhostHat
            },
            GrooveFeel.MatrixTech => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                2 or 6 => Percussion.Kick | Percussion.Clap | Percussion.Snare | Percussion.Hat,
                _ => Percussion.Hat | Percussion.GhostHat
            },
            _ => step switch
            {
                0 or 4 => Percussion.Kick | Percussion.Hat,
                2 or 6 => Percussion.Snare | Percussion.Clap,
                _ => Percussion.Hat | Percussion.GhostHat
            }
        };
    }

    private static double[]? GetPadNotes(GrooveFeel feel, GrooveChord chord, int step)
    {
        return step is 0 or 2 or 4 or 6 ? chord.Pad : null;
    }

    private static double[]? GetHookNotes(GrooveFeel feel, GrooveChord chord, int bar, int step)
    {
        return feel switch
        {
            GrooveFeel.TranceAnthem => step switch
            {
                0 or 4 => chord.Hook,
                2 or 6 => ShiftOctave(chord.Hook, 1.5),
                3 or 7 => ShiftOctave(chord.Hook, 0.75),
                _ => null
            },
            GrooveFeel.TeamsRemix => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.25),
                2 => ShiftOctave(chord.Hook, 1.5),
                3 => ShiftOctave(chord.Hook, 0.75),
                4 => ShiftOctave(chord.Hook, 1.33),
                5 => chord.Hook,
                6 => ShiftOctave(chord.Hook, 1.5),
                7 => ShiftOctave(chord.Hook, 1.2),
                _ => null
            },
            GrooveFeel.SkypeSpark => step switch
            {
                0 => ShiftOctave(chord.Hook, 0.75),
                1 => chord.Hook,
                2 => ShiftOctave(chord.Hook, 1.25),
                3 => ShiftOctave(chord.Hook, 1.5),
                4 => ShiftOctave(chord.Hook, 2.0),
                5 => ShiftOctave(chord.Hook, 1.25),
                6 => ShiftOctave(chord.Hook, 1.5),
                7 => chord.Hook,
                _ => null
            },
            GrooveFeel.MerlinAnthem => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.5),
                2 => ShiftOctave(chord.Hook, 1.25),
                3 => ShiftOctave(chord.Hook, 0.75),
                4 => ShiftOctave(chord.Hook, 1.25),
                5 => ShiftOctave(chord.Hook, 1.75),
                6 => ShiftOctave(chord.Hook, 1.5),
                7 => chord.Hook,
                _ => null
            },
            GrooveFeel.Cyberpunk => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.25),
                2 => ShiftOctave(chord.Hook, 1.5),
                3 => ShiftOctave(chord.Hook, 1.25),
                4 => ShiftOctave(chord.Hook, 0.75),
                5 => chord.Hook,
                6 => ShiftOctave(chord.Hook, 1.5),
                7 => chord.Hook,
                _ => null
            },
            GrooveFeel.Synthwave => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.25),
                2 => ShiftOctave(chord.Hook, 1.5),
                3 => ShiftOctave(chord.Hook, 1.5),
                4 => chord.Hook,
                5 => ShiftOctave(chord.Hook, 0.75),
                6 => ShiftOctave(chord.Hook, 1.25),
                7 => ShiftOctave(chord.Hook, 1.5),
                _ => null
            },
            GrooveFeel.ElectroBass => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.25),
                2 => ShiftOctave(chord.Hook, 1.5),
                3 => ShiftOctave(chord.Hook, 0.75),
                4 => chord.Hook,
                5 => ShiftOctave(chord.Hook, 0.75),
                6 => ShiftOctave(chord.Hook, 1.25),
                7 => ShiftOctave(chord.Hook, 1.5),
                _ => null
            },
            GrooveFeel.FunkFusion => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.25),
                2 => ShiftOctave(chord.Hook, 1.5),
                3 => chord.Hook,
                4 => ShiftOctave(chord.Hook, 0.75),
                5 => ShiftOctave(chord.Hook, 1.5),
                6 => ShiftOctave(chord.Hook, 1.25),
                7 => chord.Hook,
                _ => null
            },
            GrooveFeel.MatrixTech => step switch
            {
                0 => chord.Hook,
                1 => ShiftOctave(chord.Hook, 1.25),
                2 => ShiftOctave(chord.Hook, 1.5),
                3 => ShiftOctave(chord.Hook, 1.5),
                4 => chord.Hook,
                5 => ShiftOctave(chord.Hook, 0.75),
                6 => ShiftOctave(chord.Hook, 1.25),
                7 => ShiftOctave(chord.Hook, 1.5),
                _ => null
            },
            _ => step switch
            {
                0 or 4 => chord.Hook,
                2 or 6 => ShiftOctave(chord.Hook, 1.5),
                _ => ShiftOctave(chord.Hook, 0.75)
            }
        };
    }

    private static double? GetBassNote(GrooveFeel feel, GrooveChord chord, int step)
    {
        return feel switch
        {
            GrooveFeel.TranceAnthem => chord.Pad[0] * (step % 2 == 1 ? 2.0 : 1.0),
            GrooveFeel.TeamsRemix => chord.Pad[0] * (step switch { 1 or 5 => 1.25, 2 or 6 => 1.5, 7 => 2.0, _ => 1.0 }),
            GrooveFeel.SkypeSpark => chord.Pad[0] * (step switch { 2 or 6 => 1.5, 3 or 7 => 2.0, _ => 1.0 }),
            GrooveFeel.MerlinAnthem => chord.Pad[0] * (step switch { 1 or 5 => 1.5, 3 or 7 => 2.0, _ => 1.0 }),
            GrooveFeel.Cyberpunk => chord.Pad[0] * (step % 2 == 1 ? 0.5 : 1.0),
            GrooveFeel.Synthwave => chord.Pad[0] * (step % 2 == 1 ? 2.0 : 1.0),
            GrooveFeel.ElectroBass => chord.Pad[0] * (step switch { 2 or 6 => 1.5, 3 or 7 => 0.75, _ => 1.0 }),
            GrooveFeel.FunkFusion => chord.Pad[0] * (step switch { 1 => 1.5, 3 => 2.0, 5 => 1.25, 7 => 1.5, _ => 1.0 }),
            GrooveFeel.MatrixTech => chord.Pad[0] * (step switch { 1 or 3 or 5 or 7 => 2.0, _ => 1.0 }),
            _ => chord.Pad[0]
        };
    }

    private static double[] TrimChord(double[] notes, int count)
    {
        if (notes.Length <= count)
        {
            return notes;
        }

        var trimmed = new double[count];
        Array.Copy(notes, trimmed, count);
        return trimmed;
    }

    private static GrooveChord Chord(double[] pad, double[] hook)
    {
        return new GrooveChord(pad, hook);
    }

    private static double[] ShiftOctave(double[] notes, double multiplier)
    {
        var shifted = new double[notes.Length];
        for (var index = 0; index < notes.Length; index++)
        {
            shifted[index] = notes[index] * multiplier;
        }

        return shifted;
    }

    private static void Repeat(int count, Action phrase)
    {
        for (var index = 0; index < count; index++)
        {
            phrase();
        }
    }

    private void QueueGrooveStep(double seconds, double[]? pad, double[]? pluck, double? bass, Percussion percussion, GrooveFeel feel)
    {
        var sampleCount = Math.Max(1, (int)(SampleRate * seconds));
        QueueWave(seconds, 0.76, i =>
        {
            var t = (double)i / SampleRate;
            var progress = (double)i / sampleCount;
            var value = 0.0;

            if (bass.HasValue)
            {
                value += BassVoice(bass.Value, t, progress) * FeelBassGain(feel);
            }

            if (pad is not null)
            {
                value += MixNotes(pad, t, progress, PadVoice) * FeelPadGain(feel);
            }

            if (pluck is not null)
            {
                Func<double, double, double, double> voice = feel switch
                {
                    GrooveFeel.TeamsRemix => SparkleMalletVoice,
                    GrooveFeel.SkypeSpark => SparkleLeadVoice,
                    _ => LeadSawVoice
                };
                value += MixNotes(pluck, t, progress, voice) * FeelHookGain(feel);
            }

            value += PercussionVoice(percussion, t, progress, i) * FeelDrumGain(feel);
            return value;
        });
    }

    private void QueueToneStep(double seconds, double[]? pad, double[]? pluck, Percussion percussion, double gain)
    {
        var sampleCount = Math.Max(1, (int)(SampleRate * seconds));
        QueueWave(seconds, gain, i =>
        {
            var t = (double)i / SampleRate;
            var progress = (double)i / sampleCount;
            var value = 0.0;
            if (pad is not null) value += MixNotes(pad, t, progress, PadVoice);
            if (pluck is not null) value += MixNotes(pluck, t, progress, LeadSawVoice);
            value += PercussionVoice(percussion, t, progress, i);
            return value;
        });
    }

    private static double MixNotes(double[] notes, double t, double progress, Func<double, double, double, double> voice)
    {
        var value = 0.0;
        foreach (var note in notes)
        {
            value += voice(note, t, progress);
        }

        return value / Math.Sqrt(notes.Length);
    }

    private static double BassVoice(double frequency, double t, double progress)
    {
        var env = Math.Exp(-1.8 * progress);
        var body = Math.Sin(2 * Math.PI * frequency * 0.5 * t) * 0.58;
        var upper = Math.Sin(2 * Math.PI * frequency * t) * 0.26;
        var sub = Math.Sin(2 * Math.PI * frequency * 0.25 * t) * 0.18;
        return (body + upper + sub) * env;
    }

    private static double PadVoice(double frequency, double t, double progress)
    {
        var attack = Math.Min(1.0, progress / 0.16);
        var release = 0.68 + Math.Sin(progress * Math.PI) * 0.32;
        var detune = frequency * (1.0 + Math.Sin(2 * Math.PI * 4.1 * t) * 0.002);
        var main = Math.Sin(2 * Math.PI * detune * t) * 0.44;
        var octave = Math.Sin(2 * Math.PI * detune * 2.0 * t) * 0.09;
        var fifth = Math.Sin(2 * Math.PI * detune * 1.5 * t) * 0.11;
        return (main + octave + fifth) * attack * release;
    }

    private static double LeadSawVoice(double frequency, double t, double progress)
    {
        var decay = Math.Exp(-2.8 * progress);
        var f = frequency * (1.0 + Math.Sin(2 * Math.PI * 5.2 * t) * 0.003);
        var osc1 = ((t * f) % 1.0) * 2.0 - 1.0;
        var osc2 = ((t * (f * 1.006)) % 1.0) * 2.0 - 1.0;
        var osc3 = ((t * (f * 0.994)) % 1.0) * 2.0 - 1.0;
        var saw = (osc1 + osc2 + osc3) * 0.28;
        var sub = Math.Sin(2 * Math.PI * (f * 0.5) * t) * 0.20;
        return (saw + sub) * decay;
    }

    private static double SparkleLeadVoice(double frequency, double t, double progress)
    {
        var decay = Math.Exp(-3.4 * progress);
        var f = frequency * (1.0 + Math.Sin(2 * Math.PI * 6.0 * t) * 0.002);
        var osc1 = Math.Sin(2 * Math.PI * f * t) * 0.42;
        var osc2 = Math.Sin(2 * Math.PI * f * 2.003 * t) * 0.22;
        var osc3 = Math.Sin(2 * Math.PI * f * 3.007 * t) * 0.12;
        var chime = Math.Sin(2 * Math.PI * f * 4.0 * t) * Math.Exp(-12.0 * progress) * 0.15;
        return (osc1 + osc2 + osc3 + chime) * decay;
    }

    private static double SparkleMalletVoice(double frequency, double t, double progress)
    {
        var decay = Math.Exp(-3.2 * progress);
        var body = Math.Sin(2 * Math.PI * frequency * t) * 0.38;
        var harmonic = Math.Sin(2 * Math.PI * frequency * 2.0 * t) * 0.22;
        var bell = Math.Sin(2 * Math.PI * frequency * 3.01 * t) * 0.14;
        var sparkle = Math.Sin(2 * Math.PI * frequency * 4.02 * t) * Math.Exp(-8.0 * progress) * 0.12;
        var tap = Math.Sin(2 * Math.PI * frequency * 6.0 * t) * Math.Exp(-30.0 * progress) * 0.06;
        return (body + harmonic + bell + sparkle + tap) * decay;
    }

    private static double PercussionVoice(Percussion percussion, double t, double progress, int sampleIndex)
    {
        var value = 0.0;
        if (percussion.HasFlag(Percussion.Kick))
        {
            var freq = 82.0 - (38.0 * Math.Min(1.0, progress * 3.0));
            value += Math.Sin(2 * Math.PI * freq * t) * Math.Exp(-8.5 * progress) * 0.78;
            value += Noise(sampleIndex) * Math.Exp(-55.0 * progress) * 0.09;
        }

        if (percussion.HasFlag(Percussion.Snare))
        {
            value += Noise(sampleIndex + 173) * Math.Exp(-17.0 * progress) * 0.26;
            value += Math.Sin(2 * Math.PI * 195.0 * t) * Math.Exp(-12.0 * progress) * 0.12;
        }

        if (percussion.HasFlag(Percussion.Clap))
        {
            var burst = Math.Exp(-30.0 * Math.Abs(progress - 0.08)) +
                        Math.Exp(-36.0 * Math.Abs(progress - 0.16)) +
                        Math.Exp(-44.0 * Math.Abs(progress - 0.24));
            value += Noise(sampleIndex + 911) * burst * 0.11;
        }

        if (percussion.HasFlag(Percussion.Hat))
        {
            var hat = Noise(sampleIndex + 511) - Noise(sampleIndex / 2 + 19);
            value += hat * Math.Exp(-30.0 * progress) * 0.075;
        }

        if (percussion.HasFlag(Percussion.GhostHat))
        {
            var hat = Noise(sampleIndex + 1201) - Noise(sampleIndex / 3 + 71);
            value += hat * Math.Exp(-42.0 * progress) * 0.045;
        }

        return value;
    }

    private static double Noise(int sampleIndex)
    {
        unchecked
        {
            var x = (uint)sampleIndex;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            return (x / (double)uint.MaxValue * 2.0) - 1.0;
        }
    }

    private static double FeelBassGain(GrooveFeel feel) => 0.27;

    private static double FeelPadGain(GrooveFeel feel) => 0.36;

    private static double FeelHookGain(GrooveFeel feel) => 0.38;

    private static double FeelDrumGain(GrooveFeel feel) => feel switch
    {
        GrooveFeel.TranceAnthem or GrooveFeel.Cyberpunk or GrooveFeel.MatrixTech => 0.68,
        GrooveFeel.MerlinAnthem or GrooveFeel.ElectroBass or GrooveFeel.FunkFusion => 0.66,
        GrooveFeel.TeamsRemix or GrooveFeel.Synthwave => 0.64,
        GrooveFeel.SkypeSpark => 0.62,
        _ => 0.65
    };

    private void QueuePause(double seconds)
    {
        QueueWave(seconds, 0, _ => 0);
    }

    private void QueueWave(double seconds, double gain, Func<int, double> sampleFactory)
    {
        var sampleCount = Math.Max(1, (int)(SampleRate * seconds));
        var pcm = new byte[sampleCount * 2];
        for (var i = 0; i < sampleCount; i++)
        {
            var progress = (double)i / sampleCount;
            var attack = Math.Min(1.0, i / (SampleRate * 0.010));
            var release = Math.Min(1.0, (sampleCount - i) / (SampleRate * 0.028));
            var value = Math.Tanh(sampleFactory(i) * 0.95);
            var sample = (short)Math.Clamp(value * Math.Min(attack, release) * gain * _volume * short.MaxValue, short.MinValue, short.MaxValue);
            pcm[i * 2] = (byte)(sample & 0xFF);
            pcm[i * 2 + 1] = (byte)(sample >> 8);
        }

        var buffer = new AudioBuffer(pcm.Length);
        Marshal.Copy(pcm, 0, buffer.DataPointer, pcm.Length);
        lock (_sync)
        {
            if (_waveOut == IntPtr.Zero)
            {
                buffer.Dispose();
                return;
            }

            _buffers.Add(buffer);
            WinMm.waveOutPrepareHeader(_waveOut, buffer.HeaderPointer, Marshal.SizeOf<WaveHeader>());
            WinMm.waveOutWrite(_waveOut, buffer.HeaderPointer, Marshal.SizeOf<WaveHeader>());
        }
    }

    private void TrimBuffers()
    {
        lock (_sync)
        {
            if (_waveOut == IntPtr.Zero)
            {
                foreach (var b in _buffers)
                {
                    b.Dispose();
                }
                _buffers.Clear();
                return;
            }

            int index = 0;
            while (index < _buffers.Count && _buffers.Count > 32)
            {
                var buffer = _buffers[index];
                var header = Marshal.PtrToStructure<WaveHeader>(buffer.HeaderPointer);
                if ((header.Flags & 1) != 0) // WHDR_DONE
                {
                    WinMm.waveOutUnprepareHeader(_waveOut, buffer.HeaderPointer, Marshal.SizeOf<WaveHeader>());
                    buffer.Dispose();
                    _buffers.RemoveAt(index);
                }
                else
                {
                    index++;
                }
            }
        }
    }

    private sealed record GrooveChord(double[] Pad, double[] Hook);

    private enum GrooveFeel
    {
        TranceAnthem,
        TeamsRemix,
        SkypeSpark,
        MerlinAnthem,
        Cyberpunk,
        Synthwave,
        ElectroBass,
        FunkFusion,
        MatrixTech
    }

    [Flags]
    private enum Percussion
    {
        None = 0,
        Kick = 1,
        Snare = 2,
        Hat = 4,
        GhostHat = 8,
        Clap = 16
    }
}

public sealed record RingtoneChoice(string Id, string Name)
{
    public override string ToString() => Name;
}

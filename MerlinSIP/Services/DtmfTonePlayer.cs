using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using MerlinSip.Models;

namespace MerlinSip.Services;

/// <summary>
/// Generates and plays authentic audible DTMF tones through the user's selected audio output device
/// when keypad digits or buttons are pressed.
/// </summary>
public static class DtmfTonePlayer
{
    private static readonly Dictionary<char, (int Low, int High)> Frequencies = new()
    {
        ['1'] = (697, 1209),
        ['2'] = (697, 1336),
        ['3'] = (697, 1477),
        ['4'] = (770, 1209),
        ['5'] = (770, 1336),
        ['6'] = (770, 1477),
        ['7'] = (852, 1209),
        ['8'] = (852, 1336),
        ['9'] = (852, 1477),
        ['*'] = (941, 1209),
        ['0'] = (941, 1336),
        ['#'] = (941, 1477),
        ['A'] = (697, 1633),
        ['B'] = (770, 1633),
        ['C'] = (852, 1633),
        ['D'] = (941, 1633)
    };

    private static readonly Dictionary<char, byte[]> CachedTones = new();

    static DtmfTonePlayer()
    {
        const int sampleRate = 8000;
        const int durationMs = 120; // Crisp 120ms standard dial tone
        const int sampleCount = sampleRate * durationMs / 1000;
        const int fadeSamples = sampleRate * 6 / 1000; // 6ms fade in/out to eliminate clicks

        foreach (var (digit, (low, high)) in Frequencies)
        {
            var buffer = new byte[sampleCount * 2];
            for (int i = 0; i < sampleCount; i++)
            {
                double t = (double)i / sampleRate;
                double envelope = 1.0;
                if (i < fadeSamples)
                {
                    envelope = (double)i / fadeSamples;
                }
                else if (i > sampleCount - fadeSamples)
                {
                    envelope = (double)(sampleCount - i) / fadeSamples;
                }

                double val = envelope * 0.32 * (Math.Sin(2.0 * Math.PI * low * t) + Math.Sin(2.0 * Math.PI * high * t));
                short sample = (short)(Math.Clamp(val, -1.0, 1.0) * 32767);
                buffer[i * 2] = (byte)(sample & 0xFF);
                buffer[i * 2 + 1] = (byte)((sample >> 8) & 0xFF);
            }
            CachedTones[digit] = buffer;
        }
    }

    public static byte[]? GetTonePcm(char digit)
    {
        var ch = char.ToUpperInvariant(digit);
        return CachedTones.TryGetValue(ch, out var pcm) ? pcm : null;
    }

    public static void Play(char digit, MediaDeviceInfo? outputDevice = null)
    {
        var pcm = GetTonePcm(digit);
        if (pcm == null) return;

        var deviceId = -1;
        if (outputDevice != null && int.TryParse(outputDevice.Id, out var parsed))
        {
            deviceId = parsed;
        }

        ThreadPool.QueueUserWorkItem(_ =>
        {
            try
            {
                var format = WaveFormat.Pcm16Mono8k();
                int openResult = WinMm.waveOutOpen(out var hWaveOut, deviceId, ref format, IntPtr.Zero, IntPtr.Zero, 0);
                if (openResult != 0) return;

                var gcHandle = GCHandle.Alloc(pcm, GCHandleType.Pinned);
                IntPtr pHeader = IntPtr.Zero;
                try
                {
                    var header = new WaveHeader
                    {
                        Data = gcHandle.AddrOfPinnedObject(),
                        BufferLength = pcm.Length,
                        Flags = 0
                    };
                    pHeader = Marshal.AllocHGlobal(Marshal.SizeOf<WaveHeader>());
                    Marshal.StructureToPtr(header, pHeader, false);
                    WinMm.waveOutPrepareHeader(hWaveOut, pHeader, Marshal.SizeOf<WaveHeader>());
                    WinMm.waveOutWrite(hWaveOut, pHeader, Marshal.SizeOf<WaveHeader>());
                    Thread.Sleep(140);
                    WinMm.waveOutUnprepareHeader(hWaveOut, pHeader, Marshal.SizeOf<WaveHeader>());
                }
                finally
                {
                    if (pHeader != IntPtr.Zero)
                    {
                        Marshal.FreeHGlobal(pHeader);
                    }
                    gcHandle.Free();
                    WinMm.waveOutClose(hWaveOut);
                }
            }
            catch (Exception ex)
            {
                DebugLog.Write($"DtmfTonePlayer play error: {ex.Message}");
            }
        });
    }
}

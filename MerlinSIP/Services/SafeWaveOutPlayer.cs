using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;

namespace MerlinSip.Services;

/// <summary>
/// High-performance, zero-allocation ring-buffered WinMM audio output engine.
/// Pre-allocates a fixed pool of pinned headers and recycles them via WOM_DONE.
/// </summary>
public sealed class SafeWaveOutPlayer : IDisposable
{
    private const int BufferCount = 8;
    private const int BufferSizeBytes = 320; // 20ms @ 8kHz 16-bit mono

    private IntPtr _hWaveOut = IntPtr.Zero;
    private readonly WinMm.WaveOutProc _callback;
    private readonly GCHandle[] _pinnedData;
    private readonly IntPtr[] _headerPointers;
    private readonly ConcurrentQueue<int> _freeBufferIndexes = new();
    private bool _isDisposed;

    public SafeWaveOutPlayer(int deviceId)
    {
        _callback = WaveOutCallback;
        var format = WaveFormat.Pcm16Mono8k();
        
        int result = WinMm.waveOutOpen(out _hWaveOut, deviceId, ref format, _callback, IntPtr.Zero, 0x00030000 /* CALLBACK_FUNCTION */);
        if (result != 0)
        {
            throw new InvalidOperationException($"waveOutOpen failed with error code: {result}");
        }

        _pinnedData = new GCHandle[BufferCount];
        _headerPointers = new IntPtr[BufferCount];

        for (int i = 0; i < BufferCount; i++)
        {
            byte[] rawBuffer = new byte[BufferSizeBytes];
            _pinnedData[i] = GCHandle.Alloc(rawBuffer, GCHandleType.Pinned);
            
            var header = new WaveHeader
            {
                Data = _pinnedData[i].AddrOfPinnedObject(),
                BufferLength = BufferSizeBytes,
                User = (IntPtr)i,
                Flags = 0
            };

            _headerPointers[i] = Marshal.AllocHGlobal(Marshal.SizeOf<WaveHeader>());
            Marshal.StructureToPtr(header, _headerPointers[i], false);
            WinMm.waveOutPrepareHeader(_hWaveOut, _headerPointers[i], Marshal.SizeOf<WaveHeader>());
            _freeBufferIndexes.Enqueue(i);
        }
    }

    public bool TryPlayFrame(ReadOnlySpan<byte> pcmData)
    {
        if (_isDisposed || _hWaveOut == IntPtr.Zero) return false;

        if (!_freeBufferIndexes.TryDequeue(out int bufferIndex))
        {
            return false;
        }

        IntPtr headerPtr = _headerPointers[bufferIndex];
        WaveHeader header = Marshal.PtrToStructure<WaveHeader>(headerPtr);
        
        int copyBytes = Math.Min(pcmData.Length, BufferSizeBytes);
        Marshal.Copy(pcmData.ToArray(), 0, header.Data, copyBytes);
        header.BufferLength = copyBytes;
        header.Flags &= ~0x00000001; // Clear WHDR_DONE
        Marshal.StructureToPtr(header, headerPtr, false);

        int writeResult = WinMm.waveOutWrite(_hWaveOut, headerPtr, Marshal.SizeOf<WaveHeader>());
        return writeResult == 0;
    }

    private volatile bool _isClosing;

    private void WaveOutCallback(IntPtr hwo, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2)
    {
        if (_isClosing || _isDisposed || _hWaveOut == IntPtr.Zero) return;

        const uint WOM_DONE = 0x3BD;
        if (uMsg == WOM_DONE && dwParam1 != IntPtr.Zero)
        {
            try
            {
                var header = Marshal.PtrToStructure<WaveHeader>(dwParam1);
                int bufferIndex = header.User.ToInt32();
                if (bufferIndex >= 0 && bufferIndex < BufferCount)
                {
                    _freeBufferIndexes.Enqueue(bufferIndex);
                }
            }
            catch
            {
            }
        }
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;
        _isClosing = true;

        var hWaveOut = _hWaveOut;
        _hWaveOut = IntPtr.Zero;

        if (hWaveOut != IntPtr.Zero)
        {
            try
            {
                WinMm.waveOutReset(hWaveOut);
            }
            catch
            {
            }

            for (int i = 0; i < BufferCount; i++)
            {
                var headerPtr = _headerPointers[i];
                _headerPointers[i] = IntPtr.Zero;

                if (headerPtr != IntPtr.Zero)
                {
                    try
                    {
                        WinMm.waveOutUnprepareHeader(hWaveOut, headerPtr, Marshal.SizeOf<WaveHeader>());
                    }
                    catch
                    {
                    }

                    try
                    {
                        Marshal.FreeHGlobal(headerPtr);
                    }
                    catch
                    {
                    }
                }

                if (_pinnedData[i].IsAllocated)
                {
                    try
                    {
                        _pinnedData[i].Free();
                    }
                    catch
                    {
                    }
                }
            }

            try
            {
                WinMm.waveOutClose(hWaveOut);
            }
            catch
            {
            }
        }
    }
}

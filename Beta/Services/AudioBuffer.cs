using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace MerlinSip.Services;

public sealed class AudioBuffer : IDisposable
{
	private nint _dataPointer;
	private nint _headerPointer;
	private int _disposedInt;

	public nint DataPointer => _dataPointer;

	public nint HeaderPointer => _headerPointer;

	public AudioBuffer(int bytes)
	{
		_dataPointer = Marshal.AllocHGlobal(bytes);
		WaveHeader structure = new WaveHeader
		{
			Data = _dataPointer,
			BufferLength = bytes
		};
		_headerPointer = Marshal.AllocHGlobal(Marshal.SizeOf<WaveHeader>());
		Marshal.StructureToPtr(structure, _headerPointer, fDeleteOld: false);
	}

	~AudioBuffer()
	{
		Dispose(false);
	}

	public void Dispose()
	{
		Dispose(true);
		GC.SuppressFinalize(this);
	}

	private void Dispose(bool disposing)
	{
		if (Interlocked.Exchange(ref _disposedInt, 1) != 0) return;

		var header = Interlocked.Exchange(ref _headerPointer, IntPtr.Zero);
		if (header != IntPtr.Zero)
		{
			Marshal.FreeHGlobal(header);
		}

		var data = Interlocked.Exchange(ref _dataPointer, IntPtr.Zero);
		if (data != IntPtr.Zero)
		{
			Marshal.FreeHGlobal(data);
		}
	}
}

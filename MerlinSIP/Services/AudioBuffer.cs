using System;
using System.Runtime.InteropServices;

namespace MerlinSip.Services;

public sealed class AudioBuffer : IDisposable
{
	private nint _dataPointer;
	private nint _headerPointer;
	private bool _disposed;

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
		if (_disposed) return;
		_disposed = true;

		if (_headerPointer != IntPtr.Zero)
		{
			Marshal.FreeHGlobal(_headerPointer);
			_headerPointer = IntPtr.Zero;
		}
		if (_dataPointer != IntPtr.Zero)
		{
			Marshal.FreeHGlobal(_dataPointer);
			_dataPointer = IntPtr.Zero;
		}
	}
}

using System;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class AudioBufferTests
{
    [Fact]
    public void AudioBuffer_Allocation_ValidPointers()
    {
        using var buffer = new AudioBuffer(320);
        Assert.NotEqual(IntPtr.Zero, buffer.DataPointer);
        Assert.NotEqual(IntPtr.Zero, buffer.HeaderPointer);
    }

    [Fact]
    public void AudioBuffer_Dispose_IsIdempotent()
    {
        var buffer = new AudioBuffer(320);
        buffer.Dispose();
        // Second dispose should not throw
        buffer.Dispose();
        Assert.Equal(IntPtr.Zero, buffer.DataPointer);
        Assert.Equal(IntPtr.Zero, buffer.HeaderPointer);
    }
}

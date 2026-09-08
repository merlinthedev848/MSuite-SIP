using System;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class AudioFrameQueueTests
{
    [Fact]
    public void AudioFrameQueue_EnqueueAndDequeue_MaintainsOrder()
    {
        var queue = new AudioFrameQueue();
        
        // Before 6 frames, DequeueOrSilence should output silence (pre-buffering)
        var silence = queue.DequeueOrSilence(160);
        Assert.Equal(160, silence.Length);
        Assert.Equal(0, queue.Underruns);

        // Feed target 6 frames
        for (int i = 0; i < 6; i++)
        {
            var frame = new short[160];
            frame[0] = (short)(i + 1);
            queue.Enqueue(frame);
        }

        Assert.Equal(6, queue.Count);

        // Dequeue should now output real frames
        var first = queue.DequeueOrSilence(160);
        Assert.Equal(1, first[0]);
        Assert.Equal(5, queue.Count);
    }

    [Fact]
    public void AudioFrameQueue_OverMaxFrames_DropsOldestFrame()
    {
        var queue = new AudioFrameQueue();
        
        // Max frames is 18
        for (int i = 0; i < 20; i++)
        {
            var frame = new short[160];
            frame[0] = (short)(i + 1);
            queue.Enqueue(frame);
        }

        // Count should cap at 18
        Assert.Equal(18, queue.Count);
    }

    [Fact]
    public void AudioFrameQueue_Clear_ResetsQueueAndUnderruns()
    {
        var queue = new AudioFrameQueue();
        queue.Enqueue(new short[160]);
        queue.Clear();

        Assert.Equal(0, queue.Count);
        Assert.Equal(0, queue.Underruns);
    }
}

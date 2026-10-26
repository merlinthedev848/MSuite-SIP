using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using WpfBrush = System.Windows.Media.Brush;
using MerlinSip.Models;

namespace MerlinSip;

public partial class CallQualityDetailsWindow : Window
{
    public CallQualityDetailsWindow(CallHistoryEntry entry)
    {
        InitializeComponent();
        Title = $"Call Quality Analysis - {entry.Name}";
        TitleTextBlock.Text = "Call Quality Analysis";
        SubtitleTextBlock.Text = $"{entry.Direction} call with {entry.Name} ({entry.Number}) • {entry.Duration}";
        
        var measured = entry.HasMeasuredQuality;
        var mos = measured ? entry.MosScore : 0;
        MosScoreTextBlock.Text = measured ? $"{mos:F1}" : "n/a";
        MosProgressBar.Value = mos;

        var level = !measured
            ? "Not measured"
            : string.IsNullOrWhiteSpace(entry.QualityLevel)
            ? (mos >= 4.2 ? "Excellent" : mos >= 3.8 ? "Good" : mos >= 3.0 ? "Fair" : "Poor")
            : entry.QualityLevel;

        QualityLevelTextBlock.Text = $"{level} Quality";
        RFactorTextBlock.Text = $"R-Factor: {entry.RFactor:F1} / 100";
        
        var brushConverter = new BrushConverter();
        if (level == "Excellent")
        {
            QualityLevelBadge.Background = (WpfBrush)brushConverter.ConvertFromString("#DEF7EC")!;
            QualityLevelTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#03543F")!;
            MosScoreTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#0E987E")!;
            MosProgressBar.Foreground = (WpfBrush)brushConverter.ConvertFromString("#10B981")!;
            QualityAssessmentTextBlock.Text = $"Measured loss {entry.PacketLossPercent:F1}% and jitter {entry.JitterMs:F1} ms.";
        }
        else if (level == "Good")
        {
            QualityLevelBadge.Background = (WpfBrush)brushConverter.ConvertFromString("#E0F2FE")!;
            QualityLevelTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#0369A1")!;
            MosScoreTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#0284C7")!;
            MosProgressBar.Foreground = (WpfBrush)brushConverter.ConvertFromString("#0284C7")!;
            QualityAssessmentTextBlock.Text = $"Measured loss {entry.PacketLossPercent:F1}% and jitter {entry.JitterMs:F1} ms.";
        }
        else if (level == "Fair")
        {
            QualityLevelBadge.Background = (WpfBrush)brushConverter.ConvertFromString("#FEF3C7")!;
            QualityLevelTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#92400E")!;
            MosScoreTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#D97706")!;
            MosProgressBar.Foreground = (WpfBrush)brushConverter.ConvertFromString("#F59E0B")!;
            QualityAssessmentTextBlock.Text = $"Measured loss {entry.PacketLossPercent:F1}% and jitter {entry.JitterMs:F1} ms.";
        }
        else if (level is "Not measured" or "Unknown")
        {
            QualityLevelBadge.Background = (WpfBrush)brushConverter.ConvertFromString("#F3F4F6")!;
            QualityLevelTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#374151")!;
            MosScoreTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#374151")!;
            MosProgressBar.Foreground = (WpfBrush)brushConverter.ConvertFromString("#9CA3AF")!;
            QualityAssessmentTextBlock.Text = "This call ended before a MOS score was measured.";
        }
        else
        {
            QualityLevelBadge.Background = (WpfBrush)brushConverter.ConvertFromString("#FEE2E2")!;
            QualityLevelTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#B91C1C")!;
            MosScoreTextBlock.Foreground = (WpfBrush)brushConverter.ConvertFromString("#EF4444")!;
            MosProgressBar.Foreground = (WpfBrush)brushConverter.ConvertFromString("#EF4444")!;
            QualityAssessmentTextBlock.Text = $"Measured loss {entry.PacketLossPercent:F1}% and jitter {entry.JitterMs:F1} ms.";
        }

        PacketLossTextBlock.Text = measured ? $"{entry.PacketLossPercent:F1} %" : "n/a";
        JitterTextBlock.Text = measured ? $"{entry.JitterMs:F1} ms" : "n/a";
        LatencyTextBlock.Text = measured && entry.LatencyMs > 0 ? $"{entry.LatencyMs:F0} ms" : "n/a";
        BitrateTextBlock.Text = measured && (entry.BitrateSendKbps > 0 || entry.BitrateRecvKbps > 0)
            ? $"{entry.BitrateSendKbps:F1} / {entry.BitrateRecvKbps:F1} kbps"
            : "n/a";

        DiagnosticSummaryTextBlock.Text = measured
            ? $"Call on {entry.StartedAt}. Measured jitter {entry.JitterMs:F1} ms, loss {entry.PacketLossPercent:F1}%, over {entry.Duration}."
            : $"Call on {entry.StartedAt} did not include measured audio.";
    }

    public CallQualityDetailsWindow(IReadOnlyList<CallHistoryEntry> history)
    {
        InitializeComponent();
        Title = "VoIP Call Quality Analytics";
        TitleTextBlock.Text = "Overall Call Quality Diagnostics";
        
        var callsWithQuality = history.Where(h => h.HasMeasuredQuality).ToList();
        var hasQuality = callsWithQuality.Count > 0;
        var avgMos = hasQuality ? callsWithQuality.Average(h => h.MosScore) : 0;
        var avgLoss = hasQuality ? callsWithQuality.Average(h => h.PacketLossPercent) : 0.0;
        var avgJitter = hasQuality ? callsWithQuality.Average(h => h.JitterMs) : 0.0;
        var avgLatency = hasQuality ? callsWithQuality.Average(h => h.LatencyMs) : 0.0;
        
        SubtitleTextBlock.Text = $"Analyzed {history.Count} calls in local history.";
        MosScoreTextBlock.Text = hasQuality ? $"{avgMos:F1}" : "n/a";
        MosProgressBar.Value = avgMos;
        
        QualityLevelTextBlock.Text = !hasQuality
            ? "Not measured"
            : avgMos >= 4.2 ? "Excellent" : avgMos >= 3.8 ? "Good" : avgMos >= 3.0 ? "Fair" : "Poor";
        RFactorTextBlock.Text = hasQuality
            ? $"Avg R-Factor: {callsWithQuality.Average(h => h.RFactor):F1} / 100"
            : "Avg R-Factor: n/a";
        PacketLossTextBlock.Text = hasQuality ? $"{avgLoss:F1} %" : "n/a";
        JitterTextBlock.Text = hasQuality ? $"{avgJitter:F1} ms" : "n/a";
        LatencyTextBlock.Text = hasQuality ? $"{avgLatency:F0} ms" : "n/a";
        BitrateTextBlock.Text = "n/a";
        
        QualityAssessmentTextBlock.Text = hasQuality
            ? $"Average MOS across {callsWithQuality.Count} measured calls is {avgMos:F1}."
            : "No calls in this history have a measured MOS score.";
        DiagnosticSummaryTextBlock.Text = hasQuality
            ? $"{history.Count} calls logged. {callsWithQuality.Count} include measured audio. Average latency {avgLatency:F0} ms, jitter {avgJitter:F1} ms, loss {avgLoss:F1}%."
            : $"{history.Count} calls logged. None include measured audio.";
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Escape)
        {
            Close();
        }
    }

    public static void ShowCallQuality(Window owner, CallHistoryEntry entry)
    {
        var window = new CallQualityDetailsWindow(entry)
        {
            Owner = owner
        };
        window.ShowDialog();
    }

    public static void ShowOverallAnalysis(Window owner, IReadOnlyList<CallHistoryEntry> history)
    {
        var window = new CallQualityDetailsWindow(history)
        {
            Owner = owner
        };
        window.ShowDialog();
    }
}

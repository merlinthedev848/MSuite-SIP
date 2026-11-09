using System;
using System.Collections.Generic;
using System.Linq;

namespace MerlinSip.Services;

/// <summary>
/// Yeastar S-Series feature codes used by a Yealink T46G and T87W.
/// </summary>
public static class DeskPhone
{
    public const string OneTouchRecord = "*1";
    public const string Voicemail = "*2";
    public const string AttendedTransfer = "*3";
    public const string BlindTransfer = "*03";
    public const string GroupPickup = "*4";
    public const string DirectedPickup = "*04";
    public const string Intercom = "*5";
    public const string Park = "*6";
    public const string DirectedPark = "*06";
    public const string ForwardAllOn = "*71";
    public const string ForwardAllOff = "*071";
    public const string ForwardBusyOn = "*72";
    public const string ForwardBusyOff = "*072";
    public const string ForwardNoAnswerOn = "*73";
    public const string ForwardNoAnswerOff = "*073";
    public const string DndOn = "*74";
    public const string DndOff = "*074";

    public static string IntercomTo(string extension) => Intercom + Digits(extension);

    public static string DirectedPickupFor(string extension) => DirectedPickup + Digits(extension);

    public static string ForwardAllTo(string? destination)
    {
        var target = Digits(destination);
        return target.Length == 0 ? ForwardAllOn : ForwardAllOn + target;
    }

    public static string Digits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        var chars = value.Where(static c => char.IsDigit(c)).ToArray();
        return new string(chars);
    }

    public static IReadOnlyList<char> DtmfDigits(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return [];
        }

        return code.Where(static c => c is '*' or '#' || char.IsDigit(c)).ToArray();
    }

    public static string? GetFeatureCodeName(string? code, MerlinSip.Models.AppStartupConfig? config = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;

        var trimmed = code.Trim();

        // Voicemail
        if (trimmed == (config?.VoicemailNumber?.Trim()) ||
            trimmed == Voicemail ||
            trimmed == "*2" ||
            trimmed == "*97" ||
            trimmed == "*98")
        {
            return "Voicemail";
        }

        // Call Pickup
        if (trimmed == (config?.CallPickupPrefix?.Trim()) ||
            trimmed == GroupPickup ||
            trimmed == "*4")
        {
            return "Group Pickup";
        }

        if (trimmed == (config?.CallRecordingCode?.Trim()) ||
            trimmed == OneTouchRecord ||
            trimmed == "*1")
        {
            return "One-Touch Record";
        }

        if (trimmed == Park || trimmed == "*6") return "Call Park";
        if (trimmed == AttendedTransfer || trimmed == "*3") return "Attended Transfer";
        if (trimmed == BlindTransfer || trimmed == "*03") return "Blind Transfer";
        if (trimmed == DndOn || trimmed == "*74") return "DND On";
        if (trimmed == DndOff || trimmed == "*074") return "DND Off";
        if (trimmed == ForwardAllOn || trimmed == "*71") return "Forward All On";
        if (trimmed == ForwardAllOff || trimmed == "*071") return "Forward All Off";
        if (trimmed == ForwardBusyOn || trimmed == "*72") return "Forward Busy On";
        if (trimmed == ForwardBusyOff || trimmed == "*072") return "Forward Busy Off";
        if (trimmed == ForwardNoAnswerOn || trimmed == "*73") return "Forward No Answer On";
        if (trimmed == ForwardNoAnswerOff || trimmed == "*073") return "Forward No Answer Off";

        if (trimmed.StartsWith(Intercom, StringComparison.Ordinal) && trimmed.Length > Intercom.Length)
        {
            return $"Intercom ({trimmed[Intercom.Length..]})";
        }

        if (trimmed.StartsWith(DirectedPickup, StringComparison.Ordinal) && trimmed.Length > DirectedPickup.Length)
        {
            return $"Directed Pickup ({trimmed[DirectedPickup.Length..]})";
        }

        if (trimmed.StartsWith(DirectedPark, StringComparison.Ordinal) && trimmed.Length > DirectedPark.Length)
        {
            return $"Directed Park ({trimmed[DirectedPark.Length..]})";
        }

        return null;
    }
}

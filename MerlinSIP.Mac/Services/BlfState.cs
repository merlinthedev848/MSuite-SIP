using System.Text;
using System.Text.RegularExpressions;

namespace MerlinSip.Mac;

internal readonly record struct BlfChannels(string Dialog = "", string Reachability = "")
{
    public static BlfChannels Apply(BlfChannels current, string? incoming, string? eventName)
    {
        if (string.IsNullOrWhiteSpace(incoming))
        {
            return current;
        }

        var source = (eventName ?? "").Split(';')[0].Trim();
        var isDialog = source.Equals("dialog", StringComparison.OrdinalIgnoreCase);
        var isPresence = source.Equals("presence", StringComparison.OrdinalIgnoreCase);
        if (isDialog || (!isPresence && incoming is "Ringing" or "Busy"))
        {
            return current with { Dialog = incoming };
        }

        return current with { Reachability = incoming };
    }

    public string Resolve()
    {
        if (Dialog is "Ringing" or "Busy")
        {
            return Dialog;
        }

        if (Reachability is "Offline" or "DND" or "Away" or "Busy" or "Available")
        {
            return Reachability;
        }

        return "Offline";
    }
}

internal static class BlfState
{
    public static bool IsBusyOrDnd(string? status)
    {
        return status != null && (
            status.Equals("Busy", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("DND", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("Do Not Disturb", StringComparison.OrdinalIgnoreCase) ||
            status.Equals(DeskPhone.BusyHereStatus, StringComparison.OrdinalIgnoreCase));
    }

    public static string PresenceNote(string? status) =>
        IsBusyOrDnd(status) ? DeskPhone.BusyHereStatus : status ?? "";

    public static string NormalizeExtension(string value)
    {
        var source = value.Trim();
        var sipMatch = Regex.Match(source, @"sip:([^@>;]+)", RegexOptions.IgnoreCase);
        if (sipMatch.Success)
        {
            source = sipMatch.Groups[1].Value;
        }

        var builder = new StringBuilder(source.Length);
        foreach (var character in source)
        {
            if (char.IsDigit(character) || character is '*' or '#')
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }

    public static string ExtractPresenceExtension(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "";
        }

        string[] patterns =
        [
            "entity\\s*=\\s*[\"'’]?(?:sip:)?([^@\"'’>;]+)",
            "<tuple\\s+id\\s*=\\s*[\"'’]?(?:sip:)?([^@\"'’>;]+)",
            "<local>.*?<identity[^>]*>\\s*(?:sip:)?([^<@>;]+)",
            "<remote>.*?<identity[^>]*>\\s*(?:sip:)?([^<@>;]+)",
            "<identity[^>]*>\\s*(?:sip:)?([^<@>;]+)"
        ];

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(body, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (!match.Success)
            {
                continue;
            }

            var candidate = NormalizeExtension(match.Groups[1].Value);
            if (!string.IsNullOrWhiteSpace(candidate) && !candidate.Equals("asterisk", StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }
        }

        return "";
    }

    public static string ParsePresenceState(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "";
        }

        var noteMatch = Regex.Match(body, "<note>\\s*([^<]+)\\s*</note>|<dm:note>\\s*([^<]+)\\s*</dm:note>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (noteMatch.Success)
        {
            var note = (noteMatch.Groups[1].Success ? noteMatch.Groups[1].Value : noteMatch.Groups[2].Value).Trim();
            if (note.Equals("Available", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Busy", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("DND", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Do Not Disturb", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Away", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Offline", StringComparison.OrdinalIgnoreCase))
            {
                return note.ToLowerInvariant() switch
                {
                    "available" => "Available",
                    "away" => "Away",
                    "dnd" or "do not disturb" => "DND",
                    "busy" => "Busy",
                    "offline" => "Offline",
                    _ => "Available"
                };
            }
        }

        if (Regex.IsMatch(body, "<rpid:do-not-disturb\\s*/>|<ep:do-not-disturb\\s*/>", RegexOptions.IgnoreCase))
        {
            return "DND";
        }

        if (Regex.IsMatch(body, "<rpid:busy\\s*/>|<rpid:on-the-phone\\s*/>|<ep:busy\\s*/>", RegexOptions.IgnoreCase))
        {
            return "Busy";
        }

        if (Regex.IsMatch(body, "<rpid:away\\s*/>|<rpid:be-right-back\\s*/>|<ep:away\\s*/>", RegexOptions.IgnoreCase))
        {
            return "Away";
        }

        if (Regex.IsMatch(body, "<rpid:available\\s*/>", RegexOptions.IgnoreCase))
        {
            return "Available";
        }

        if (body.Contains("dialog-info", StringComparison.OrdinalIgnoreCase))
        {
            if (Regex.IsMatch(body, "<state>\\s*(?:early|trying)\\s*</state>|<dialog[^>]*\\s+state\\s*=\\s*[\"'’]?(?:early|trying)", RegexOptions.IgnoreCase))
            {
                return "Ringing";
            }

            if (Regex.IsMatch(body, "<state>\\s*confirmed\\s*</state>|<dialog[^>]*\\s+state\\s*=\\s*[\"'’]?confirmed", RegexOptions.IgnoreCase))
            {
                return "Busy";
            }

            if (Regex.IsMatch(body, "<state>\\s*terminated\\s*</state>|<dialog[^>]*\\s+state\\s*=\\s*[\"'’]?terminated", RegexOptions.IgnoreCase))
            {
                return "Available";
            }

            return "Available";
        }

        if (Regex.IsMatch(body, "<basic>\\s*closed\\s*</basic>", RegexOptions.IgnoreCase))
        {
            return "Offline";
        }

        if (Regex.IsMatch(body, "<basic>\\s*open\\s*</basic>", RegexOptions.IgnoreCase))
        {
            return "Available";
        }

        if (body.Contains("busy", StringComparison.OrdinalIgnoreCase) || body.Contains("inuse", StringComparison.OrdinalIgnoreCase))
        {
            return "Busy";
        }

        if (body.Contains("ring", StringComparison.OrdinalIgnoreCase) || body.Contains("early", StringComparison.OrdinalIgnoreCase))
        {
            return "Ringing";
        }

        if (body.Contains("dnd", StringComparison.OrdinalIgnoreCase))
        {
            return "DND";
        }

        if (body.Contains("away", StringComparison.OrdinalIgnoreCase))
        {
            return "Away";
        }

        if (body.Contains("open", StringComparison.OrdinalIgnoreCase) || body.Contains("available", StringComparison.OrdinalIgnoreCase) || body.Contains("idle", StringComparison.OrdinalIgnoreCase))
        {
            return "Available";
        }

        return "";
    }

    public static string BuildPresenceXml(string extension, string domain, string status)
    {
        var isOffline = status.Equals("Offline", StringComparison.OrdinalIgnoreCase) ||
                        status.Equals("Appear Offline", StringComparison.OrdinalIgnoreCase);
        var basicStatus = isOffline ? "closed" : "open";
        var noteText = PresenceNote(status);
        var activityXml = status.ToLowerInvariant() switch
        {
            "away" or "appear away" => "      <rpid:away/>\n",
            "dnd" or "do not disturb" => "      <rpid:do-not-disturb/>\n      <rpid:on-the-phone/>\n",
            "busy" or "busyhere" => "      <rpid:busy/>\n      <rpid:on-the-phone/>\n",
            "available" => "      <rpid:available/>\n",
            _ => ""
        };

        var content = new StringBuilder();
        content.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        content.AppendLine("<presence xmlns=\"urn:ietf:params:xml:ns:pidf\"");
        content.AppendLine("          xmlns:dm=\"urn:ietf:params:xml:ns:pidf:data-model\"");
        content.AppendLine("          xmlns:rpid=\"urn:ietf:params:xml:ns:pidf:rpid\"");
        content.AppendLine($"          entity=\"sip:{extension}@{domain}\">");
        content.AppendLine($"  <tuple id=\"{extension}\">");
        content.AppendLine("    <status>");
        content.AppendLine($"      <basic>{basicStatus}</basic>");
        content.AppendLine("    </status>");
        content.AppendLine($"    <note>{noteText}</note>");
        content.AppendLine("  </tuple>");
        if (!string.IsNullOrWhiteSpace(activityXml))
        {
            content.AppendLine($"  <dm:person id=\"p_{extension}\">");
            content.AppendLine("    <rpid:activities>");
            content.Append(activityXml);
            content.AppendLine("    </rpid:activities>");
            content.AppendLine($"    <dm:note>{noteText}</dm:note>");
            content.AppendLine("  </dm:person>");
        }

        content.Append("</presence>");
        return content.ToString();
    }

    public static string BuildDialogXml(string extension, string domain, bool offHook)
    {
        var state = offHook ? "confirmed" : "terminated";
        var noteText = offHook ? DeskPhone.BusyHereStatus : "Phone is on the hook and available";
        var content = new StringBuilder();
        content.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        content.AppendLine("<dialog-info xmlns=\"urn:ietf:params:xml:ns:dialog-info\" version=\"1\" state=\"full\"");
        content.AppendLine($"             entity=\"sip:{extension}@{domain}\">");
        content.AppendLine($"  <dialog id=\"{extension}_offhook\" direction=\"recipient\">");
        content.AppendLine($"    <state>{state}</state>");
        content.AppendLine($"    <notes>{noteText}</notes>");
        content.AppendLine("  </dialog>");
        content.Append("</dialog-info>");
        return content.ToString();
    }

    public static int PresenceExpires(string status) =>
        status.Equals("Offline", StringComparison.OrdinalIgnoreCase) ||
        status.Equals("Appear Offline", StringComparison.OrdinalIgnoreCase)
            ? 0
            : 3600;
}

internal static class CallQuality
{
    public static double Mos(double latencyMs, double jitterMs, double lossPercentage)
    {
        var effective = latencyMs + (2.0 * jitterMs) + 10.0;
        var delayImpairment = effective < 160.0 ? effective / 40.0 : (effective / 40.0) + ((effective - 160.0) / 10.0);
        var lossImpairment = 95.0 * (lossPercentage / (lossPercentage + 10.0));
        var r = 93.2 - delayImpairment - lossImpairment;
        if (r < 0)
        {
            r = 0;
        }

        double mos;
        if (r <= 0)
        {
            mos = 1;
        }
        else if (r >= 100)
        {
            mos = 4.4;
        }
        else
        {
            mos = 1.0 + (0.035 * r) + (r * (r - 60.0) * (100.0 - r) * 7E-06);
            if (mos < 1)
            {
                mos = 1;
            }

            if (mos > 4.4)
            {
                mos = 4.4;
            }
        }

        return Math.Round(mos, 2);
    }

    public static int Bars(double lossPercent, double jitterMs) =>
        lossPercent < 1.0 && jitterMs < 20.0 ? 5
        : lossPercent < 3.0 && jitterMs < 40.0 ? 4
        : lossPercent < 7.0 && jitterMs < 70.0 ? 3
        : lossPercent < 15.0 ? 2
        : 1;

    public static string Label(int bars) => bars switch
    {
        5 => "5/5 Excellent",
        4 => "4/5 Good",
        3 => "3/5 Fair",
        2 => "2/5 Poor",
        1 => "1/5 Weak signal",
        _ => "Not measured"
    };
}

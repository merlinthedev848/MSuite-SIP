using Avalonia.Controls;
using Avalonia.Data.Converters;
using Avalonia.Layout;
using Avalonia.Media;
using System.Globalization;

namespace MerlinSip.Mac;

public sealed class IncomingCallWindow : Window
{
    private readonly TextBlock _title;
    private readonly Action _answer;
    private readonly Action _decline;

    public IncomingCallWindow(LineSnapshot line, Action answer, Action decline)
    {
        _answer = answer;
        _decline = decline;
        Title = "Incoming call";
        Width = 360;
        Height = 220;
        CanResize = false;
        Topmost = true;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var answerButton = new Button { Content = "Answer", HorizontalAlignment = HorizontalAlignment.Stretch };
        var declineButton = new Button { Content = "Decline", HorizontalAlignment = HorizontalAlignment.Stretch };
        answerButton.Classes.Add("good");
        declineButton.Classes.Add("danger");
        answerButton.Click += (_, _) => { _answer(); Close(); };
        declineButton.Click += (_, _) => { _decline(); Close(); };
        _title = new TextBlock { FontSize = 22, FontWeight = FontWeight.Bold, TextWrapping = TextWrapping.Wrap };
        Content = new StackPanel
        {
            Margin = new Avalonia.Thickness(24),
            Spacing = 12,
            Children =
            {
                new TextBlock { Text = "Incoming call", Foreground = Brushes.Gray },
                _title,
                new Grid
                {
                    ColumnDefinitions = new ColumnDefinitions("*,*"),
                    Children =
                    {
                        answerButton,
                        declineButton
                    }
                }
            }
        };
        Grid.SetColumn(declineButton, 1);
        declineButton.Margin = new Avalonia.Thickness(8, 0, 0, 0);
        Update(line);
    }

    public void Update(LineSnapshot line) => _title.Text = string.IsNullOrWhiteSpace(line.RemoteName) ? line.Remote : line.RemoteName + "\n" + line.Remote;
}

public sealed class TransferWindow : Window
{
    private readonly TextBox _number;

    public TransferWindow(string suggested, bool otherLineConnected)
    {
        Title = "Transfer call";
        Width = 380;
        Height = 230;
        CanResize = false;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        _number = new TextBox { Text = suggested, Watermark = "Extension or number" };
        var blind = new Button { Content = "Blind transfer" };
        blind.Classes.Add("primary");
        var attended = new Button { Content = "Complete attended transfer", IsEnabled = otherLineConnected };
        var cancel = new Button { Content = "Cancel" };
        blind.Click += (_, _) => Close(_number.Text);
        attended.Click += (_, _) => Close("attended");
        cancel.Click += (_, _) => Close(null);
        Content = new StackPanel
        {
            Margin = new Avalonia.Thickness(20),
            Spacing = 10,
            Children =
            {
                new TextBlock { Text = "Transfer this call", FontWeight = FontWeight.Bold, FontSize = 18 },
                _number,
                blind,
                attended,
                cancel
            }
        };
    }
}

public sealed class ContactEditWindow : Window
{
    public ContactEditWindow(DeskContact? existing)
    {
        Title = existing == null ? "Add contact" : "Edit contact";
        Width = 400;
        Height = 420;
        CanResize = false;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var name = new TextBox { Text = existing?.Name ?? "", Watermark = "Name" };
        var number = new TextBox { Text = existing?.Number ?? "", Watermark = "Number" };
        var company = new TextBox { Text = existing?.Company ?? "", Watermark = "Company" };
        var notes = new TextBox { Text = existing?.Notes ?? "", Watermark = "Notes", AcceptsReturn = true, Height = 70 };
        var favorite = new CheckBox { Content = "Favorite", IsChecked = existing?.IsFavorite == true };
        var save = new Button { Content = "Save" };
        save.Classes.Add("primary");
        var cancel = new Button { Content = "Cancel" };
        save.Click += (_, _) =>
        {
            if (string.IsNullOrWhiteSpace(number.Text))
            {
                return;
            }

            Close(new DeskContact
            {
                Id = existing?.Id ?? Guid.NewGuid().ToString("N"),
                Name = name.Text?.Trim() ?? "",
                Number = number.Text.Trim(),
                Company = company.Text?.Trim() ?? "",
                Notes = notes.Text?.Trim() ?? "",
                IsFavorite = favorite.IsChecked == true
            });
        };
        cancel.Click += (_, _) => Close(null);
        Content = new StackPanel
        {
            Margin = new Avalonia.Thickness(20),
            Spacing = 8,
            Children =
            {
                new TextBlock { Text = Title, FontSize = 18, FontWeight = FontWeight.Bold },
                name, number, company, notes, favorite, save, cancel
            }
        };
    }
}

public sealed class QualityWindow : Window
{
    public QualityWindow(LineSnapshot line)
    {
        Title = "Call quality";
        Width = 420;
        Height = 360;
        CanResize = false;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        string Row(string label, string value) => label + "    " + value;
        var measured = line.QualityMeasured;
        var lines = new List<string>
        {
            Row("Line", line.Id.ToString()),
            Row("Party", line.RemoteName + "  " + line.Remote),
            Row("State", line.Phase + (line.Held ? " (hold)" : "")),
            Row("Duration", line.Clock),
            Row("Call quality", measured ? line.QualityText : "Not measured")
        };
        if (measured)
        {
            lines.Add(Row("Codec", string.IsNullOrWhiteSpace(line.Codec) ? "Not measured" : line.Codec));
            lines.Add(Row("Loss", line.LossPercent.ToString("0.0") + "%"));
            lines.Add(Row("Jitter", line.JitterMs.ToString("0.0") + " ms"));
            lines.Add(Row("Latency", line.LatencyMs.ToString("0") + " ms"));
            lines.Add(Row("MOS", line.Mos > 0 ? line.Mos.ToString("0.00") : "Not measured"));
            lines.Add(Row("Signal", line.SignalBars > 0 ? line.SignalBars + "/5" : "Not measured"));
        }

        lines.Add(Row("Sent", line.PacketsSent.ToString()));
        lines.Add(Row("Received", line.PacketsReceived.ToString()));
        lines.Add(Row("Recording", string.IsNullOrWhiteSpace(line.RecordingPath) ? "Off" : line.RecordingPath));
        var body = new TextBlock
        {
            FontFamily = new FontFamily("Consolas, Menlo, monospace"),
            Text = string.Join("\n", lines)
        };
        var close = new Button { Content = "Close", HorizontalAlignment = HorizontalAlignment.Left };
        close.Click += (_, _) => Close();
        Content = new StackPanel
        {
            Margin = new Avalonia.Thickness(20),
            Spacing = 12,
            Children =
            {
                new TextBlock { Text = "Call quality", FontSize = 18, FontWeight = FontWeight.Bold },
                body,
                close
            }
        };
    }
}

public sealed class HexBrushConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string text && Color.TryParse(text, out var color))
        {
            return new SolidColorBrush(color);
        }

        return Brushes.Gray;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

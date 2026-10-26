using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

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
        _number = new TextBox { Text = suggested, PlaceholderText = "Extension or number" };
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
        var name = new TextBox { Text = existing?.Name ?? "", PlaceholderText = "Name" };
        var number = new TextBox { Text = existing?.Number ?? "", PlaceholderText = "Number" };
        var company = new TextBox { Text = existing?.Company ?? "", PlaceholderText = "Company" };
        var notes = new TextBox { Text = existing?.Notes ?? "", PlaceholderText = "Notes", AcceptsReturn = true, Height = 70 };
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
        var body = new TextBlock
        {
            FontFamily = new FontFamily("Consolas, Menlo, monospace"),
            Text = string.Join("\n",
            [
                Row("Line", line.Id.ToString()),
                Row("Party", line.RemoteName + "  " + line.Remote),
                Row("State", line.Phase + (line.Held ? " (hold)" : "")),
                Row("Duration", line.Clock),
                Row("Codec", string.IsNullOrWhiteSpace(line.Codec) ? "Negotiating" : line.Codec),
                Row("Sent", line.PacketsSent.ToString()),
                Row("Received", line.PacketsReceived.ToString()),
                Row("Lost", line.PacketsLost.ToString()),
                Row("Loss", line.LossPercent.ToString("0.0") + "%"),
                Row("Jitter", line.JitterMs.ToString("0.0") + " ms"),
                Row("MOS", line.Mos > 0 ? line.Mos.ToString("0.00") : "n/a"),
                Row("Recording", string.IsNullOrWhiteSpace(line.RecordingPath) ? "Off" : line.RecordingPath)
            ])
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

public sealed class VideoCallWindow : Window
{
    private readonly TextBlock _title;
    private readonly TextBlock _clock;
    private readonly Action _hangup;
    private readonly Action _mute;

    public VideoCallWindow(Action hangup, Action mute)
    {
        _hangup = hangup;
        _mute = mute;
        Title = "Video call";
        Width = 720;
        Height = 460;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        _title = new TextBlock { Foreground = Brushes.White, FontSize = 28, FontWeight = FontWeight.Bold };
        _clock = new TextBlock { Foreground = Brushes.LightGray, FontSize = 16 };
        var end = new Button { Content = "End video call" };
        end.Classes.Add("danger");
        var muteButton = new Button { Content = "Mute", Foreground = Brushes.White, Background = Brushes.Transparent };
        end.Click += (_, _) => { _hangup(); Close(); };
        muteButton.Click += (_, _) => _mute();
        Content = new Grid
        {
            Background = Brushes.Black,
            Children =
            {
                new StackPanel
                {
                    Margin = new Avalonia.Thickness(28),
                    VerticalAlignment = VerticalAlignment.Bottom,
                    Spacing = 8,
                    Children =
                    {
                        new TextBlock { Text = "Merlin SIP video", Foreground = Brushes.Gold },
                        _title,
                        _clock,
                        new TextBlock { Text = "Audio is live on this call. The video window follows the selected camera from Settings.", Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap },
                        new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Children = { end, muteButton } }
                    }
                }
            }
        };
    }

    public void Update(LineSnapshot line)
    {
        _title.Text = string.IsNullOrWhiteSpace(line.RemoteName) ? line.Remote : line.RemoteName;
        _clock.Text = line.Phase + "  ·  " + line.Clock + (line.Muted ? "  ·  Muted" : "");
    }
}

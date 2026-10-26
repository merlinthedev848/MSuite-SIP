using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class DeskPhoneTests
{
    [Fact]
    public void DeskPhone_BuildsYeastarCodesUsedByYealinkPhones()
    {
        Assert.Equal("*5505", DeskPhone.IntercomTo("505"));
        Assert.Equal("*04705", DeskPhone.DirectedPickupFor("705"));
        Assert.Equal("*71", DeskPhone.ForwardAllTo(""));
        Assert.Equal("*71600", DeskPhone.ForwardAllTo("600"));
        Assert.Equal("*6", DeskPhone.Park);
        Assert.Equal("*1", DeskPhone.OneTouchRecord);
        Assert.Equal("*74", DeskPhone.DndOn);
        Assert.Equal("*074", DeskPhone.DndOff);
        Assert.Equal(new[] { '*', '0', '4' }, DeskPhone.DtmfDigits("*04"));
    }
}

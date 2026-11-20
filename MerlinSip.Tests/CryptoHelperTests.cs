using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class CryptoHelperTests
{
    [Fact]
    public void ProtectAndUnprotect_RoundTripsSuccessfully()
    {
        const string original = "P@ssw0rd_Test_12345!#";
        var protectedValue = CryptoHelper.Protect(original);

        Assert.NotEmpty(protectedValue);
        Assert.NotEqual(original, protectedValue);
        Assert.True(CryptoHelper.IsEncryptedBlob(protectedValue));

        var unprotectedValue = CryptoHelper.Unprotect(null, protectedValue);
        Assert.Equal(original, unprotectedValue);
    }

    [Fact]
    public void Protect_DoesNotDoubleEncrypt_WhenAlreadyEncrypted()
    {
        const string original = "SecretKey_987";
        var protectedValue = CryptoHelper.Protect(original);
        var doubleProtected = CryptoHelper.Protect(protectedValue);

        Assert.Equal(protectedValue, doubleProtected);
    }

    [Fact]
    public void Unprotect_ReturnsPlaintext_WhenPassedUnencryptedString()
    {
        const string plain = "SimplePlaintextPassword";
        var result = CryptoHelper.Unprotect(null, plain);

        Assert.Equal(plain, result);
    }

    [Fact]
    public void Unprotect_FallsBackToLegacyPlaintext_WhenEncryptedIsEmpty()
    {
        const string legacy = "LegacyPassword";
        var result = CryptoHelper.Unprotect(legacy, "");

        Assert.Equal(legacy, result);
    }

    [Fact]
    public void Protect_ReturnsEmpty_WhenInputIsNullOrEmpty()
    {
        Assert.Empty(CryptoHelper.Protect(null));
        Assert.Empty(CryptoHelper.Protect(""));
        Assert.Empty(CryptoHelper.Protect("   "));
    }
}

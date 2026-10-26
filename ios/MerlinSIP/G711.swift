import Foundation

enum G711 {
    private static let bias = 0x84
    private static let clip = 32635
    private static let muLawTable: [Int16] = (0..<256).map { decodeMuLaw(UInt8($0)) }
    private static let aLawTable: [Int16] = (0..<256).map { decodeALaw(UInt8($0)) }

    static func muLawToLinear(_ value: UInt8) -> Int16 {
        muLawTable[Int(value)]
    }

    static func aLawToLinear(_ value: UInt8) -> Int16 {
        aLawTable[Int(value)]
    }

    static func linearToMuLaw(_ sample: Int16) -> UInt8 {
        var sign = 0
        var magnitude = Int(sample)
        if magnitude < 0 {
            magnitude = -magnitude
            sign = 0x80
        }
        if magnitude > clip { magnitude = clip }
        magnitude += bias

        var exponent = 7
        var mask = 0x4000
        while (magnitude & mask) == 0 && exponent > 0 {
            exponent -= 1
            mask >>= 1
        }
        let mantissa = (magnitude >> (exponent + 3)) & 0x0F
        return UInt8(~(sign | (exponent << 4) | mantissa) & 0xFF)
    }

    static func linearToALaw(_ sample: Int16) -> UInt8 {
        var sign = 0
        var magnitude = Int(sample)
        if magnitude < 0 {
            magnitude = -magnitude
            sign = 0x80
        }
        if magnitude > clip { magnitude = clip }

        let encoded: Int
        if magnitude >= 256 {
            var exponent = 7
            var mask = 0x4000
            while (magnitude & mask) == 0 && exponent > 0 {
                exponent -= 1
                mask >>= 1
            }
            let mantissa = (magnitude >> (exponent + 3)) & 0x0F
            encoded = sign | (exponent << 4) | mantissa
        } else {
            encoded = sign | (magnitude >> 4)
        }
        return UInt8((encoded ^ 0x55) & 0xFF)
    }

    static let muLawSilence: UInt8 = 0xFF
    static let aLawSilence: UInt8 = 0xD5

    private static func decodeMuLaw(_ value: UInt8) -> Int16 {
        let inverted = ~value
        let sign = inverted & 0x80
        let exponent = (inverted >> 4) & 0x07
        let mantissa = inverted & 0x0F
        var sample = ((Int(mantissa) << 3) + bias) << exponent
        sample -= bias
        return Int16(sign != 0 ? -sample : sample)
    }

    private static func decodeALaw(_ value: UInt8) -> Int16 {
        let decoded = value ^ 0x55
        let sign = decoded & 0x80
        let exponent = (decoded & 0x70) >> 4
        let mantissa = decoded & 0x0F
        let sample: Int
        if exponent == 0 {
            sample = (Int(mantissa) << 4) + 8
        } else {
            sample = ((Int(mantissa) << 4) + 0x108) << (Int(exponent) - 1)
        }
        return Int16(sign != 0 ? -sample : sample)
    }
}

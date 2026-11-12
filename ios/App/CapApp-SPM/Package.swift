// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0"),
        .package(name: "CapacitorCommunityKeepAwake", path: "../../../node_modules/@capacitor-community/keep-awake"),
        .package(name: "CapacitorCommunityTextToSpeech", path: "../../../node_modules/@capacitor-community/text-to-speech"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorDevice", path: "../../../node_modules/@capacitor/device"),
        .package(name: "CapacitorFilesystem", path: "../../../node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorGeolocation", path: "../../../node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/@capacitor/haptics"),
        .package(name: "CapacitorShare", path: "../../../node_modules/@capacitor/share"),
        .package(name: "GameServices", path: "../../../plugins/game-services"),
        .package(name: "NativeAr", path: "../../../plugins/native-ar"),
        .package(name: "Npu", path: "../../../plugins/npu"),
        .package(name: "PhoneAi", path: "../../../plugins/phone-ai"),
        .package(name: "PhoneSensors", path: "../../../plugins/phone-sensors"),
        .package(name: "PowerState", path: "../../../plugins/power-state"),
        .package(name: "RichHaptics", path: "../../../plugins/rich-haptics"),
        .package(name: "ScreenRate", path: "../../../plugins/screen-rate"),
        .package(name: "SpeechAudio", path: "../../../plugins/speech-audio")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityKeepAwake", package: "CapacitorCommunityKeepAwake"),
                .product(name: "CapacitorCommunityTextToSpeech", package: "CapacitorCommunityTextToSpeech"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "GameServices", package: "GameServices"),
                .product(name: "NativeAr", package: "NativeAr"),
                .product(name: "Npu", package: "Npu"),
                .product(name: "PhoneAi", package: "PhoneAi"),
                .product(name: "PhoneSensors", package: "PhoneSensors"),
                .product(name: "PowerState", package: "PowerState"),
                .product(name: "RichHaptics", package: "RichHaptics"),
                .product(name: "ScreenRate", package: "ScreenRate"),
                .product(name: "SpeechAudio", package: "SpeechAudio")
            ]
        )
    ]
)

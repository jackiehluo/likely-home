// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LikelyHomeCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "LikelyHomeCore", targets: ["LikelyHomeCore"])],
    targets: [
        .target(name: "LikelyHomeCore"),
        .testTarget(name: "LikelyHomeCoreTests", dependencies: ["LikelyHomeCore"]),
    ]
)

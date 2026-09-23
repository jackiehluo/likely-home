import SwiftUI

struct HouseMark: View {
    var body: some View {
        GeometryReader { geometry in
            let scale = geometry.size.width / 512
            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: 8 * scale, y: 216 * scale))
                    path.addLine(to: CGPoint(x: 256 * scale, y: 10 * scale))
                    path.addLine(to: CGPoint(x: 504 * scale, y: 216 * scale))
                    path.addLine(to: CGPoint(x: 464 * scale, y: 216 * scale))
                    path.addLine(to: CGPoint(x: 464 * scale, y: 502 * scale))
                    path.addLine(to: CGPoint(x: 48 * scale, y: 502 * scale))
                    path.addLine(to: CGPoint(x: 48 * scale, y: 216 * scale))
                    path.closeSubpath()
                }
                .fill(Color(white: 0.07))
                Text("✶✶")
                    .font(.custom("Arial Unicode MS", size: 242 * scale))
                    .tracking(-30 * scale)
                    .foregroundStyle(.white)
                    .offset(y: 109 * scale)
            }
        }
    }
}

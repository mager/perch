import AppKit

// The same perched bird as public/logo.svg, drawn as a template for both menu bar appearances.
enum Bird {
    static func image(size: CGFloat = 22) -> NSImage {
        let image = NSImage(size: NSSize(width: 64, height: 64), flipped: true) { _ in
            NSColor.labelColor.setFill(); NSColor.labelColor.setStroke()
            let body = NSBezierPath()
            body.move(to: .init(x: 10, y: 47))
            body.curve(to: .init(x: 26, y: 20), controlPoint1: .init(x: 17, y: 39), controlPoint2: .init(x: 18, y: 29))
            body.curve(to: .init(x: 41, y: 16), controlPoint1: .init(x: 31, y: 14), controlPoint2: .init(x: 36, y: 13))
            for p in [(47,21),(56,24),(47,28)] { body.line(to: .init(x:p.0,y:p.1)) }
            body.curve(to: .init(x: 20, y: 49), controlPoint1: .init(x: 45, y: 42), controlPoint2: .init(x: 35, y: 50))
            for p in [(10,53),(13,46),(10,47)] { body.line(to: .init(x:p.0,y:p.1)) }; body.close(); body.fill()
            let legs = NSBezierPath(); legs.lineWidth = 2.6; legs.lineCapStyle = .round
            legs.move(to:.init(x:27,y:49)); legs.line(to:.init(x:26,y:55))
            legs.move(to:.init(x:33,y:49)); legs.line(to:.init(x:34,y:55))
            legs.move(to:.init(x:10,y:57)); legs.line(to:.init(x:52,y:57)); legs.stroke()
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current?.compositingOperation = .destinationOut
            let wing = NSBezierPath(); wing.lineWidth = 3.3; wing.lineCapStyle = .round
            wing.move(to:.init(x:35,y:25)); wing.curve(to:.init(x:20,y:46),controlPoint1:.init(x:35,y:36),controlPoint2:.init(x:30,y:42))
            wing.curve(to:.init(x:41,y:28),controlPoint1:.init(x:32,y:46),controlPoint2:.init(x:41,y:39)); wing.stroke()
            NSBezierPath(ovalIn:.init(x:40.5,y:19.5,width:3,height:3)).fill()
            NSGraphicsContext.restoreGraphicsState()
            return true
        }
        image.size = NSSize(width:size,height:size); image.isTemplate = true
        return image
    }
}

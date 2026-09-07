import UserNotifications

// iOS will not render a push's image on its own: the payload has to be
// intercepted, the file downloaded, and re-attached before the notification is
// shown. Expo puts the URL at body._richContent.image. A drink post's photo is a
// signed URL that expires, so a failed download simply falls back to the text.
class NotificationService: UNNotificationServiceExtension {
  var contentHandler: ((UNNotificationContent) -> Void)?
  var bestAttemptContent: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent

    guard let bestAttemptContent else { return }

    guard let body = request.content.userInfo["body"] as? [String: Any],
      let richContent = body["_richContent"] as? [String: Any],
      let imageUrlString = richContent["image"] as? String,
      let imageUrl = URL(string: imageUrlString)
    else {
      contentHandler(bestAttemptContent)
      return
    }

    attachImage(from: imageUrl, to: bestAttemptContent, completion: contentHandler)
  }

  private func attachImage(
    from url: URL,
    to content: UNMutableNotificationContent,
    completion: @escaping (UNNotificationContent) -> Void
  ) {
    URLSession.shared.downloadTask(with: url) { downloaded, _, _ in
      guard let downloaded else {
        completion(content)
        return
      }

      // UNNotificationAttachment infers the type from the extension, and the
      // downloaded file has none.
      let target = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent(downloaded.lastPathComponent + ".jpg")
      try? FileManager.default.removeItem(at: target)

      do {
        try FileManager.default.moveItem(at: downloaded, to: target)
        content.attachments = [try UNNotificationAttachment(identifier: "image", url: target)]
      } catch {
        // The text notification is still worth delivering.
      }

      completion(content)
    }.resume()
  }

  // The system allows about 30 seconds; a slow download loses the image, not
  // the notification.
  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let bestAttemptContent {
      contentHandler(bestAttemptContent)
    }
  }
}

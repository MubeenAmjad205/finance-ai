package com.financeai.sync;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NotificationListener extends NotificationListenerService {
    private static final String TAG = "FinanceAINotifListener";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        String packageName = sbn.getPackageName();
        CharSequence titleObj = sbn.getNotification().extras.getCharSequence("android.title");
        CharSequence textObj = sbn.getNotification().extras.getCharSequence("android.text");

        String title = titleObj != null ? titleObj.toString() : "";
        String text = textObj != null ? textObj.toString() : "";
        String combined = (title + " " + text).toLowerCase();

        Log.d(TAG, "Notification from: " + packageName + " - " + title + ": " + text);

        if (isFinancialNotification(packageName, combined)) {
            postToWebhook(packageName, title + ": " + text);
        }
    }

    private boolean isFinancialNotification(String pkg, String content) {
        return pkg.contains("jazzcash") ||
               pkg.contains("easypaisa") ||
               pkg.contains("ubl") ||
               pkg.contains("askari") ||
               pkg.contains("mashreq") ||
               pkg.contains("sadapay") ||
               pkg.contains("nayapay") ||
               content.contains("debited") ||
               content.contains("credited") ||
               content.contains("sent rs") ||
               content.contains("paid rs");
    }

    private void postToWebhook(String sender, String body) {
        new Thread(() -> {
            try {
                String targetUrl = "https://finance-ai.mianmubeen205.workers.dev/api/sms/webhook";
                URL url = new URL(targetUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setDoOutput(true);

                String jsonInput = String.format("{\"sender\":\"%s\",\"body\":\"%s\"}",
                        sender.replace("\"", "\\\""),
                        body.replace("\"", "\\\"").replace("\n", " "));

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInput.getBytes("utf-8");
                    os.write(input, 0, input.length);
                }

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "Notification Webhook Response: " + responseCode);
            } catch (Exception e) {
                Log.e(TAG, "Failed to post notification to webhook", e);
            }
        }).start();
    }
}

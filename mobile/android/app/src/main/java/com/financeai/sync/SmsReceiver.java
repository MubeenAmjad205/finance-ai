package com.financeai.sync;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "FinanceAISmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if ("android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            Bundle bundle = intent.getExtras();
            if (bundle != null) {
                Object[] pdus = (Object[]) bundle.get("pdus");
                if (pdus != null) {
                    for (Object pdu : pdus) {
                        SmsMessage sms = SmsMessage.createFromPdu((byte[]) pdu);
                        String sender = sms.getDisplayOriginatingAddress();
                        String body = sms.getMessageBody();

                        Log.d(TAG, "SMS Received from: " + sender);

                        if (isBankSender(sender, body)) {
                            postToWebhook(context, sender, body);
                        }
                    }
                }
            }
        }
    }

    private boolean isBankSender(String sender, String body) {
        if (sender == null) return false;
        String lowerSender = sender.toLowerCase();
        String lowerBody = body != null ? body.toLowerCase() : "";

        return lowerSender.contains("ubl") ||
               lowerSender.contains("askari") ||
               lowerSender.contains("mashreq") ||
               lowerSender.contains("jazzcash") ||
               lowerSender.contains("easypaisa") ||
               lowerSender.contains("meezan") ||
               lowerSender.contains("hbl") ||
               lowerBody.contains("debited") ||
               lowerBody.contains("credited") ||
               lowerBody.contains("trx id");
    }

    private void postToWebhook(Context context, String sender, String body) {
        new Thread(() -> {
            try {
                // Default target Worker URL
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
                Log.d(TAG, "Webhook HTTP Response Code: " + responseCode);
            } catch (Exception e) {
                Log.e(TAG, "Failed to post SMS to webhook", e);
            }
        }).start();
    }
}

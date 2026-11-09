const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin для перехоплення сповіщень Google Wallet та банківських додатків (Monobank, Приват24 тощо).
 * Реєструє нативний Android NotificationListenerService та Deep Link схеми для відкриття налаштувань дозволу.
 */
function withNotificationListener(config) {
  // 1. Оновлюємо AndroidManifest.xml: додаємо NotificationListenerService та активність налаштувань
  config = withAndroidManifest(config, async (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const app = manifest.application && manifest.application[0];
    if (!app) return modConfig;

    // Реєструємо сервіс перехоплення сповіщень
    app.service = app.service || [];
    const serviceName = '.NashiHroshiNotificationListener';
    const hasService = app.service.some((s) => s.$ && s.$['android:name'] === serviceName);
    if (!hasService) {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:label': 'Наші Гроші: Читач оплат',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true'
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.service.notification.NotificationListenerService' } }
            ]
          }
        ]
      });
    }

    // Реєструємо допоміжну активність для відкриття системних налаштувань сповіщень через Deep Link
    app.activity = app.activity || [];
    const settingsActivityName = '.NotificationSettingsActivity';
    const hasSettingsActivity = app.activity.some((a) => a.$ && a.$['android:name'] === settingsActivityName);
    if (!hasSettingsActivity) {
      app.activity.push({
        $: {
          'android:name': settingsActivityName,
          'android:exported': 'true',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar'
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [
              { $: { 'android:name': 'android.intent.category.DEFAULT' } },
              { $: { 'android:name': 'android.intent.category.BROWSABLE' } }
            ],
            data: [{ $: { 'android:scheme': 'nashihroshi', 'android:host': 'open-notification-settings' } }]
          }
        ]
      });
    }

    return modConfig;
  });

  // 2. Генеруємо Java-файли сервісу та активності
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const javaDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'android1303',
        'nashihroshi'
      );

      fs.mkdirSync(javaDir, { recursive: true });

      // 2.1. NashiHroshiNotificationListener.java
      const listenerJava = `package com.android1303.nashihroshi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NashiHroshiNotificationListener extends NotificationListenerService {

    private static final String TAG = "NashiHroshiNotif";
    private static final String PENDING_FILE = "pending_wallet_notifications.json";
    private static final String CHANNEL_ID = "nashi_hroshi_wallet_channel";

    // Відомі пакети Google Wallet та банків в Україні
    private static final String[] SUPPORTED_PACKAGES = {
        "com.google.android.apps.walletnfcrel",
        "com.google.android.gms",
        "com.ftband.mono",
        "ua.privatbank.ap24",
        "com.pumb.mobile",
        "ua.alfabank.mobile",
        "ua.ukrsibbank.ukrsibonline",
        "ua.aval.raiffeisen"
    };

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        String pkg = sbn.getPackageName();
        if (!isSupportedPackage(pkg)) return;

        Notification n = sbn.getNotification();
        Bundle extras = n.extras;
        if (extras == null) return;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        String title = titleCs != null ? titleCs.toString() : "";
        String text = bigTextCs != null ? bigTextCs.toString() : (textCs != null ? textCs.toString() : "");
        String combined = (title + " " + text).trim();

        if (combined.isEmpty()) return;

        // Перевіряємо, чи це платіж або списання
        ParsedPayment payment = parsePayment(pkg, title, text);
        if (payment != null && payment.amount > 0) {
            savePendingPayment(payment);
            showConfirmationNotification(payment);
        }
    }

    private boolean isSupportedPackage(String pkg) {
        if (pkg == null) return false;
        for (String p : SUPPORTED_PACKAGES) {
            if (pkg.equalsIgnoreCase(p)) return true;
        }
        return false;
    }

    private static class ParsedPayment {
        String id;
        long timestamp;
        String packageName;
        double amount;
        String merchant;
        String rawText;
        String suggestedCategory;
    }

    private ParsedPayment parsePayment(String pkg, String title, String text) {
        String full = (title + " " + text).toLowerCase();

        // Ігноруємо технічні пуші, коди підтвердження тощо
        if (full.contains("код") || full.contains("пароль") || full.contains("вхід") || full.contains("auth")) {
            return null;
        }

        // Шукаємо суму (напр: 185.50 ₴, 185 ₴, 185.50 грн, 185 UAH, Оплата 185)
        Pattern amountPattern = Pattern.compile("(\\\\d+[\\\\s\\\\d]*[.,]?\\\\d{0,2})\\\\s*(?:₴|грн|uah)");
        Matcher m = amountPattern.matcher(full);

        double amount = 0;
        if (m.find()) {
            String rawNum = m.group(1).replace(" ", "").replace(",", ".");
            try {
                amount = Double.parseDouble(rawNum);
            } catch (Exception ignored) {}
        }

        if (amount <= 0) return null;

        // Шукаємо торгову точку (Сільпо, АТБ, WOG, OKKO, тощо)
        String merchant = extractMerchant(title, text);
        String category = guessCategory(merchant);

        ParsedPayment p = new ParsedPayment();
        p.id = "wallet_" + System.currentTimeMillis() + "_" + ((int) (Math.random() * 1000));
        p.timestamp = System.currentTimeMillis();
        p.packageName = pkg;
        p.amount = Math.round(amount * 100.0) / 100.0;
        p.merchant = merchant;
        p.rawText = (title + ": " + text).trim();
        p.suggestedCategory = category;

        return p;
    }

    private String extractMerchant(String title, String text) {
        String source = text.isEmpty() ? title : text;
        
        // Паттерни: "в Сільпо", "у WOG", "Списання 150 грн. Сільпо. Баланс"
        Pattern pIn = Pattern.compile("(?:в|у|in|at)\\\\s+([A-Za-zА-Яа-яІіЇїЄє0-9\\\\s'\\"-]{2,25})");
        Matcher mIn = pIn.matcher(source);
        if (mIn.find()) {
            return cleanMerchantName(mIn.group(1));
        }

        // Розбивка за крапками або комами (напр. "Оплата 150 ₴, Сільпо")
        String[] parts = source.split("[,.]");
        for (String part : parts) {
            String trimmed = part.trim();
            if (!trimmed.toLowerCase().contains("оплата") &&
                !trimmed.toLowerCase().contains("списання") &&
                !trimmed.toLowerCase().contains("покупка") &&
                !trimmed.toLowerCase().contains("баланс") &&
                !trimmed.toLowerCase().contains("доступно") &&
                !trimmed.toLowerCase().contains("картк") &&
                trimmed.length() >= 2 && trimmed.length() <= 25) {
                return cleanMerchantName(trimmed);
            }
        }

        return "Оплата карткою";
    }

    private String cleanMerchantName(String raw) {
        if (raw == null) return "Оплата карткою";
        String s = raw.replaceAll("[.,;!?]", "").trim();
        return s.isEmpty() ? "Оплата карткою" : s;
    }

    private String guessCategory(String merchant) {
        String m = merchant.toLowerCase();
        if (m.contains("сільпо") || m.contains("атб") || m.contains("фора") || m.contains("novus") || m.contains("ашан") || m.contains("metro") || m.contains("маркет") || m.contains("продук")) {
            return "Продукти";
        }
        if (m.contains("окко") || m.contains("wog") || m.contains("upg") || m.contains("брсм") || m.contains("азс") || m.contains("бензин") || m.contains("газ")) {
            return "Пальне/Заправка";
        }
        if (m.contains("кава") || m.contains("coffee") || m.contains("mcdonald") || m.contains("піца") || m.contains("суші") || m.contains("кафе") || m.contains("ресторан")) {
            return "Ресторани/Кафе";
        }
        if (m.contains("аптек") || m.contains("ліки") || m.contains("pharmacy")) {
            return "Аптека/Ліки";
        }
        if (m.contains("uklon") || m.contains("bolt") || m.contains("uber") || m.contains("таксі")) {
            return "Таксі";
        }
        if (m.contains("єва") || m.contains("eva") || m.contains("prostor") || m.contains("аврора") || m.contains("епіцентр")) {
            return "Господарчі товари";
        }
        return "Продукти";
    }

    private synchronized void savePendingPayment(ParsedPayment payment) {
        try {
            File file = new File(getFilesDir(), PENDING_FILE);
            JSONArray array = new JSONArray();

            if (file.exists()) {
                StringBuilder sb = new StringBuilder();
                BufferedReader reader = new BufferedReader(new FileReader(file));
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                String content = sb.toString().trim();
                if (!content.isEmpty()) {
                    array = new JSONArray(content);
                }
            }

            JSONObject obj = new JSONObject();
            obj.put("id", payment.id);
            obj.put("timestamp", payment.timestamp);
            obj.put("packageName", payment.packageName);
            obj.put("amount", payment.amount);
            obj.put("merchant", payment.merchant);
            obj.put("rawText", payment.rawText);
            obj.put("suggestedCategory", payment.suggestedCategory);

            array.put(obj);

            FileWriter writer = new FileWriter(file, false);
            writer.write(array.toString());
            writer.flush();
            writer.close();
            Log.d(TAG, "Saved pending payment: " + payment.amount + " in " + payment.merchant);
        } catch (Exception e) {
            Log.e(TAG, "Failed to save pending payment", e);
        }
    }

    private void showConfirmationNotification(ParsedPayment p) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Оплати через Google Wallet",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Сповіщення про нові витрати для підтвердження в бюджет");
                nm.createNotificationChannel(channel);
            }

            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("nashihroshi://pending"));
            intent.setPackage(getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getActivity(this, (int) (p.timestamp % 10000), intent, flags);

            String formattedAmount = String.format("%.2f", p.amount).replace(",", ".");
            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

            builder.setSmallIcon(android.R.drawable.stat_notify_more)
                .setContentTitle("💰 Новий платіж: " + formattedAmount + " ₴")
                .setContentText(p.merchant + " • Торкніться для підтвердження")
                .setAutoCancel(true)
                .setContentIntent(pi);

            nm.notify((int) (p.timestamp % 100000), builder.build());
        } catch (Exception e) {
            Log.e(TAG, "Failed to show notification", e);
        }
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'NashiHroshiNotificationListener.java'), listenerJava, 'utf8');

      // 2.2. NotificationSettingsActivity.java
      const settingsJava = `package com.android1303.nashihroshi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;

public class NotificationSettingsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(fallback);
            } catch (Exception ignored) {}
        }
        finish();
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'NotificationSettingsActivity.java'), settingsJava, 'utf8');

      return modConfig;
    }
  ]);

  return config;
}

module.exports = withNotificationListener;

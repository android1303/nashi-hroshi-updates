const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin, який автоматично створює нативний Android-віджет для робочого столу телефону
 * з кнопками ШІ: «🎙 Голосом», «📷 Чек (Фото)», «💬 Текстом» та «➕ Додати».
 * При натисканні на кнопку на робочому столі відкриває додаток одразу у потрібному режимі через Deep Link:
 * nashihroshi://ai?mode=voice | nashihroshi://ai?mode=photo | nashihroshi://ai?mode=text | nashihroshi://add
 */
function withAndroidAIWidget(config) {
  // 1. Додаємо <receiver> віджета та intent-filter для схеми nashihroshi:// у AndroidManifest.xml
  config = withAndroidManifest(config, async (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const app = manifest.application && manifest.application[0];
    if (!app) return modConfig;

    // Переконуємось, що MainActivity підтримує deep link nashihroshi://
    const mainActivity = (app.activity || []).find(
      (a) => a.$['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];
      const hasScheme = mainActivity['intent-filter'].some((f) =>
        (f.data || []).some((d) => d.$ && d.$['android:scheme'] === 'nashihroshi')
      );
      if (!hasScheme) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [
            { $: { 'android:name': 'android.intent.category.DEFAULT' } },
            { $: { 'android:name': 'android.intent.category.BROWSABLE' } }
          ],
          data: [{ $: { 'android:scheme': 'nashihroshi' } }]
        });
      }
    }

    // Реєструємо AppWidgetProvider
    app.receiver = app.receiver || [];
    const widgetReceiverName = '.NashiHroshiWidgetProvider';
    const alreadyExists = app.receiver.some(
      (r) => r.$ && r.$['android:name'] === widgetReceiverName
    );
    if (!alreadyExists) {
      app.receiver.push({
        $: {
          'android:name': widgetReceiverName,
          'android:exported': 'true',
          'android:label': 'Наші Гроші — ШІ Віджет'
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }
            ]
          }
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/nashi_hroshi_widget_info'
            }
          }
        ]
      });
    }

    return modConfig;
  });

  // 2. Генеруємо Java-клас провайдера та XML-ресурси віджета
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
      const layoutDir = path.join(resDir, 'layout');
      const xmlDir = path.join(resDir, 'xml');
      const drawableDir = path.join(resDir, 'drawable');
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

      fs.mkdirSync(layoutDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.mkdirSync(javaDir, { recursive: true });

      // Фон віджета (закруглений темний блок)
      const widgetBgXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#1E1B24" />
    <corners android:radius="22dp" />
    <stroke android:width="1dp" android:color="#33D0BCFF" />
</shape>`;
      fs.writeFileSync(path.join(drawableDir, 'widget_bg.xml'), widgetBgXml, 'utf8');

      // Фон акцентної кнопки «Голосом»
      const btnPrimaryXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#D0BCFF" />
    <corners android:radius="14dp" />
</shape>`;
      fs.writeFileSync(path.join(drawableDir, 'widget_btn_primary.xml'), btnPrimaryXml, 'utf8');

      // Фон вторинних кнопок «По фото» та «Текст»
      const btnSecondaryXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#2B2733" />
    <corners android:radius="14dp" />
    <stroke android:width="1dp" android:color="#22FFFFFF" />
</shape>`;
      fs.writeFileSync(path.join(drawableDir, 'widget_btn_secondary.xml'), btnSecondaryXml, 'utf8');

      // Розмітка віджета (res/layout/nashi_hroshi_widget.xml)
      const layoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:background="@drawable/widget_bg"
    android:padding="12dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:layout_marginBottom="8dp">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="✨ Наші Гроші • ШІ-ввід"
            android:textColor="#E6E1E5"
            android:textSize="12sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/btn_widget_add"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="＋ Вручну"
            android:textColor="#D0BCFF"
            android:textSize="11sp"
            android:textStyle="bold"
            android:paddingLeft="8dp"
            android:paddingRight="4dp" />
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:weightSum="3">

        <TextView
            android:id="@+id/btn_widget_voice"
            android:layout_width="0dp"
            android:layout_height="40dp"
            android:layout_weight="1"
            android:layout_marginEnd="6dp"
            android:background="@drawable/widget_btn_primary"
            android:gravity="center"
            android:text="🎙 Голосом"
            android:textColor="#1E192B"
            android:textSize="12sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/btn_widget_photo"
            android:layout_width="0dp"
            android:layout_height="40dp"
            android:layout_weight="1"
            android:layout_marginEnd="6dp"
            android:background="@drawable/widget_btn_secondary"
            android:gravity="center"
            android:text="📷 По фото"
            android:textColor="#E6E1E5"
            android:textSize="12sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/btn_widget_text"
            android:layout_width="0dp"
            android:layout_height="40dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_secondary"
            android:gravity="center"
            android:text="💬 Текст"
            android:textColor="#E6E1E5"
            android:textSize="12sp"
            android:textStyle="bold" />
    </LinearLayout>
</LinearLayout>`;
      fs.writeFileSync(path.join(layoutDir, 'nashi_hroshi_widget.xml'), layoutXml, 'utf8');

      // Метадані віджета (res/xml/nashi_hroshi_widget_info.xml)
      const widgetInfoXml = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="60dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:updatePeriodMillis="86400000"
    android:initialLayout="@layout/nashi_hroshi_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />`;
      fs.writeFileSync(path.join(xmlDir, 'nashi_hroshi_widget_info.xml'), widgetInfoXml, 'utf8');

      // Java-клас NashiHroshiWidgetProvider.java
      const javaCode = `package com.android1303.nashihroshi;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class NashiHroshiWidgetProvider extends AppWidgetProvider {

    private static PendingIntent buildDeepLinkIntent(Context context, String uriStr, int reqCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uriStr));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, reqCode, intent, flags);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.nashi_hroshi_widget);

            views.setOnClickPendingIntent(
                R.id.btn_widget_voice,
                buildDeepLinkIntent(context, "nashihroshi://ai?mode=voice", 101)
            );
            views.setOnClickPendingIntent(
                R.id.btn_widget_photo,
                buildDeepLinkIntent(context, "nashihroshi://ai?mode=photo", 102)
            );
            views.setOnClickPendingIntent(
                R.id.btn_widget_text,
                buildDeepLinkIntent(context, "nashihroshi://ai?mode=text", 103)
            );
            views.setOnClickPendingIntent(
                R.id.btn_widget_add,
                buildDeepLinkIntent(context, "nashihroshi://add", 104)
            );

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
`;
      fs.writeFileSync(path.join(javaDir, 'NashiHroshiWidgetProvider.java'), javaCode, 'utf8');

      return modConfig;
    }
  ]);

  return config;
}

module.exports = withAndroidAIWidget;

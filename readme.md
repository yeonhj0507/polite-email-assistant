# Project Setup Guide

## 🧩 Dependencies & Build Instructions

### 🧱 Chrome Extension

No installation is required.

To install the extension:

1. Open Chrome and go to
```
chrome://extensions
```

2. Enable **Developer Mode** (toggle switch at the top right).

3. Click **"Load unpacked"** and select the **root directory** of this project.

---

### 🖥️ Flutter Tray App

This project uses [Flutter](https://flutter.dev/docs/get-started/install). Please ensure it is installed before continuing.

#### Step 1: Install Dependencies

Navigate to the `flutter_tray_app` directory and run:

```
flutter pub get
```

#### Step 2: Run the App
Use the following command to run the app:
(Replace {your own openAI key} with your actual OpenAI API key)

```
flutter run -d windows --dart-define=OPENAI_API_KEY={your own openAI key}
```

### ✅ Verifying the Setup
Once the app is running and the Chrome extension is loaded, you should see:
```
Extension Connected
```

This means everything is working correctly!



## 📦 Dependencies and Licenses

### Flutter Tray App

This project uses the following open-source packages:

- [Flutter](https://flutter.dev) – BSD 3-Clause License  
- [tray_manager](https://pub.dev/packages/tray_manager) – MIT License  
- [window_manager](https://pub.dev/packages/window_manager) – MIT License  
- [http](https://pub.dev/packages/http) – BSD 3-Clause License  

All licenses are permissive and compatible with the MIT License used by this project.

### Chrome Extension

No third-party libraries are used. The extension relies solely on standard web technologies and Chrome APIs.


## 📄 License

This project is licensed under the [MIT License](./LICENSE) by Paperclip Team.

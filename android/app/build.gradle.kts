plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dailylog.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.dailylog.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1"
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    applicationVariants.all {
        outputs.all {
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
                "DailyLog-v${versionName}.apk"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.17.1")
}

val bundleWeb by tasks.registering(Exec::class) {
    val workspace = rootProject.projectDir.parentFile
    workingDir = workspace
    commandLine(
        if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm",
        "run", "build:android-web"
    )
    inputs.files(
        fileTree(workspace.resolve("src")),
        fileTree(workspace.resolve("public")),
        fileTree(workspace) { include(".env", ".env.local", ".env.android", ".env.android.local") },
        workspace.resolve("styles.css"),
        workspace.resolve("index.html"),
        workspace.resolve("vite.config.js"),
        workspace.resolve("package.json"),
        workspace.resolve("package-lock.json"),
        workspace.resolve("scripts/check-android-env.mjs")
    )
    inputs.property("supabaseUrl", providers.environmentVariable("VITE_SUPABASE_URL").orElse(""))
    inputs.property("supabasePublishableKey", providers.environmentVariable("VITE_SUPABASE_PUBLISHABLE_KEY").orElse(""))
    outputs.dir(layout.projectDirectory.dir("src/main/assets"))
}

tasks.named("preBuild") { dependsOn(bundleWeb) }

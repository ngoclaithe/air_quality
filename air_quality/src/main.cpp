#include <WiFi.h>
#include <HardwareSerial.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <Adafruit_BMP280.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <SD.h>
#include <Arduino.h>
#define WIFI_SSID     "tang2"
#define WIFI_PASSWORD "12345678"

#define RX2 16  
#define TX2 17  
#define CS 5
#define SEALEVELPRESSURE_HPA (1013.25)

HardwareSerial pmsSerial(2);  
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_BMP280 bmp;
uint8_t buffer[32];

unsigned long currentTime;

const char* mqtt_server = "9bf62adad86549a3a08bd830a5735042.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_username = "air_quality";
const char* mqtt_password = "Abc12345678";
const char* mqtt_pub_topic = "data";

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT...");
    if (mqttClient.connect("ESP32Client", mqtt_username, mqtt_password)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
    Serial.begin(115200);
    Wire.begin();
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Dang khoi dong");
    
    if (!bmp.begin(0x76)) {
        lcd.setCursor(0, 1);
        lcd.print("Loi BMP280!");
        delay(2000);
    } else {
        Serial.println("\nDa ket noi BMP280");
        bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,    
                        Adafruit_BMP280::SAMPLING_X2,     
                        Adafruit_BMP280::SAMPLING_X16,    
                        Adafruit_BMP280::FILTER_X16,      
                        Adafruit_BMP280::STANDBY_MS_500); 
    }
    
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Dang ket noi WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        lcd.setCursor(0, 1);
        lcd.print("Ket noi WiFi...");
    }
    Serial.println("\nWiFi da ket noi");
    Serial.print("Dia chi IP: ");
    Serial.println(WiFi.localIP());
    lcd.setCursor(0, 1);
    lcd.print("WiFi OK");
    delay(1000);

    espClient.setInsecure();  
    mqttClient.setServer(mqtt_server, mqtt_port);
    connectMQTT();

    pmsSerial.begin(9600, SERIAL_8N1, RX2, TX2);
    if (!SD.begin(CS)){
        Serial.println("Loi ket noi SD");
        return;
    }else
    {
        Serial.println("Ket noi SD thanh cong");
    }
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("He thong san sang");
}

bool readPMSData() {
    if (pmsSerial.available() < 32) return false;
    if (pmsSerial.read() != 0x42 || pmsSerial.read() != 0x4D) return false;
    
    buffer[0] = 0x42;
    buffer[1] = 0x4D;
    pmsSerial.readBytes(&buffer[2], 30);
    
    uint16_t checksum = 0;
    for (int i = 0; i < 30; i++) {
        checksum += buffer[i];
    }
    uint16_t receivedChecksum = (buffer[30] << 8) | buffer[31];
    
    return checksum == receivedChecksum;
}

void displayEnvironmentalData(float temperature, float pressure) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("T:");
    lcd.print(temperature, 1);
    lcd.print("C");
    lcd.setCursor(0, 1);
    lcd.print("P:");
    lcd.print(pressure, 1);
    lcd.print("hPa");
    delay(2000);
}

void loop() {
    if (!mqttClient.connected()) {
      connectMQTT();
    }
    mqttClient.loop();
    
    float temperature = bmp.readTemperature();
    float pressure = bmp.readPressure() / 100.0F;
    
    Serial.print("Nhiet do: "); Serial.print(temperature);
    Serial.print(" C, Ap suat: "); Serial.print(pressure);
    Serial.println(" hPa");
    
    displayEnvironmentalData(temperature, pressure);
    
    String payload = "{";
    payload += "\"temperature\":";
    payload += temperature;
    payload += ",\"pressure\":";
    payload += pressure;
    
    uint16_t pm1_0 = 0;
    uint16_t pm2_5 = 0;
    uint16_t pm10 = 0;

    if (readPMSData()) {
        pm1_0 = (buffer[10] << 8) | buffer[11];
        pm2_5 = (buffer[12] << 8) | buffer[13];
        pm10  = (buffer[14] << 8) | buffer[15];
        
        Serial.print("PM1.0: "); Serial.print(pm1_0);
        Serial.print(" ug/m3, PM2.5: "); Serial.print(pm2_5);
        Serial.print(" ug/m3, PM10: "); Serial.println(pm10);
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("PM1.0: "); lcd.print(pm1_0); lcd.print(" ug/m3");
        lcd.setCursor(0, 1);
        lcd.print("PM2.5:"); lcd.print(pm2_5);
        lcd.print(" PM10:"); lcd.print(pm10);
    }
    
    payload += ",\"pm1_0\":";
    payload += pm1_0;
    payload += ",\"pm2_5\":";
    payload += pm2_5;
    payload += ",\"pm10\":";
    payload += pm10;
    payload += "}";
    
    if (mqttClient.publish(mqtt_pub_topic, payload.c_str())) {
      Serial.println("Payload published: " + payload);
    } else {
      Serial.println("Failed to publish payload");
    }
    
    File dataFile = SD.open("/pws_data.txt", FILE_APPEND);
    if (dataFile) {
        dataFile.print(millis());
        dataFile.print(",");
        
        dataFile.print(temperature);
        dataFile.print(",");
        dataFile.print(pressure);
        dataFile.print(",");
        dataFile.print(pm1_0);
        dataFile.print(",");
        dataFile.print(pm2_5);
        dataFile.print(",");
        dataFile.println(pm10);
        
        dataFile.close();
        Serial.println("Data logged to SD card");
    } else {
        Serial.println("Error opening data file");
    }
    
    delay(2000);
}
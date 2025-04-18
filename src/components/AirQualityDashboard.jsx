import React, { useState, useEffect } from 'react';
import mqtt from 'mqtt';
import GaugeChart from 'react-gauge-chart';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const AirQualityDashboard = () => {
  const [sensorData, setSensorData] = useState({
    temperature: 0,
    pressure: 0,
    pm1_0: 0,
    pm2_5: 0,
    pm10: 0
  });

  const [historicalData, setHistoricalData] = useState({
    temperature: [],
    pressure: [],
    pm2_5: []
  });

  const [mqttStatus, setMqttStatus] = useState('Disconnected');

  const sanitizeValue = (value) => {
    const sanitized = Number(value);
    return !isNaN(sanitized) && isFinite(sanitized) ? sanitized : 0;
  };

  useEffect(() => {
    const clientId = 'airquality_' + Math.random().toString(16).substr(2, 8);
    const client = mqtt.connect('wss://9bf62adad86549a3a08bd830a5735042.s1.eu.hivemq.cloud:8884/mqtt', {
      clientId: clientId,
      username: 'air_quality',
      password: 'Abc12345678',
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 30 * 1000,
    });

    client.on('connect', () => {
      setMqttStatus('Connected');
      console.log('Connected to MQTT broker');
      client.subscribe('data', (err) => {
        if (!err) {
          console.log('Subscribed to topic "data"');
        }
      });
    });

    client.on('message', (topic, message) => {
      if (topic === 'data') {
        try {
          let parsedData = {};
          try {
            parsedData = JSON.parse(message.toString());
          } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            try {
              const cleanedMessage = message.toString().replace(/nan/gi, '0');
              parsedData = JSON.parse(cleanedMessage);
            } catch (cleanError) {
              console.error('Error parsing cleaned message:', cleanError);

              parsedData = {
                temperature: 0,
                pressure: 0,
                pm1_0: 0,
                pm2_5: 0,
                pm10: 0
              };
            }
          }

          const sanitizedData = {
            temperature: sanitizeValue(parsedData.temperature),
            pressure: sanitizeValue(parsedData.pressure),
            pm1_0: sanitizeValue(parsedData.pm1_0),
            pm2_5: sanitizeValue(parsedData.pm2_5),
            pm10: sanitizeValue(parsedData.pm10)
          };

          updateSensorData(sanitizedData);
        } catch (error) {
          console.error('Unhandled error processing message:', error);
          updateSensorData({
            temperature: 0,
            pressure: 0,
            pm1_0: 0,
            pm2_5: 0,
            pm10: 0
          });
        }
      }
    });

    client.on('error', (error) => {
      setMqttStatus('Error');
      console.error('MQTT Connection Error:', error);
    });

    return () => {
      client.end();
    };
  }, []);

  const updateSensorData = (newData) => {
    setSensorData(prevData => ({
      ...prevData,
      ...newData
    }));

    setHistoricalData(prev => ({
      temperature: [...prev.temperature, { value: newData.temperature, time: new Date().toLocaleTimeString() }].slice(-10),
      pressure: [...prev.pressure, { value: newData.pressure, time: new Date().toLocaleTimeString() }].slice(-10),
      pm2_5: [...prev.pm2_5, { value: newData.pm2_5, time: new Date().toLocaleTimeString() }].slice(-10)
    }));
  };

  const getPMStatus = (value) => {
    if (value <= 50) return { text: 'Good', color: 'bg-green-500' };
    if (value <= 100) return { text: 'Moderate', color: 'bg-yellow-500' };
    return { text: 'Unhealthy', color: 'bg-red-500' };
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Air Quality Monitoring</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">MQTT Connection</h2>
          <span className={`px-3 py-1 rounded text-white ${
            mqttStatus === 'Connected' ? 'bg-green-500' : 'bg-red-500'
          }`}>
            {mqttStatus}
          </span>
        </div>

        <div className="bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2 text-center">Temperature</h2>
          <GaugeChart 
            id="temp-gauge"
            percent={sensorData.temperature / 50} 
            nrOfLevels={3} 
            colors={['#deffa0', '#ff9900', '#ff0000']} 
          />
          <p className="text-center font-bold">{sensorData.temperature}°C</p>
        </div>

        <div className="bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2 text-center">Pressure</h2>
          <GaugeChart 
            id="pressure-gauge"
            percent={sensorData.pressure / 10000} 
            nrOfLevels={3} 
            colors={['#def3f8', '#4fc3f7', '#0288d1']} 
          />
          <p className="text-center font-bold">{sensorData.pressure}</p>
        </div>

        <div className="md:col-span-2 bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Particulate Matter (PM2.5) History</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={historicalData.pm2_5}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Particulate Matter Status</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Value</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {['pm1_0', 'pm2_5', 'pm10'].map(type => {
                const status = getPMStatus(sensorData[type]);
                return (
                  <tr key={type} className="border-b">
                    <td className="py-2">{type.toUpperCase()}</td>
                    <td className="py-2">{sensorData[type]}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded text-white text-xs ${status.color}`}>
                        {status.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AirQualityDashboard;
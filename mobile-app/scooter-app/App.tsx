import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "./src/styles/theme";

import { PauseProvider } from "./src/context/PauseContext";
import { ConnectionProvider } from "./src/context/ConnectionContext";
import { TelemetryProvider } from "./src/context/TelemetryContext";
import { GnssProvider } from "./src/context/GnssContext";
import { RideSessionProvider } from "./src/context/RideSessionContext";
import { AuthProvider } from "./src/providers/AuthProvider";
import { useAuth } from "./src/providers/AuthProvider";
import PauseOverlay from "./src/components/PauseOverlay";
import AuthScreen from "./src/screens/AuthScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import RideScreen from "./src/screens/RideScreen";
import ChargingScreen from "./src/screens/ChargingScreen";
import LocationScreen from "./src/screens/LocationScreen";
import DiagnosticsScreen from "./src/screens/DiagnosticsScreen";
import BleSendScreen from "./src/screens/BleSendScreen";
import { initDatabase } from "./src/db/initDatabase";

import "./src/polyfills";

const Tab = createBottomTabNavigator();

export default function App() {
  useEffect(() => {
    try {
      initDatabase();
    } catch (error) {
      console.error("[db] init failed", error);
    }
  }, []);

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <PauseProvider>
      <RideSessionProvider>
        <TelemetryProvider>
          <ConnectionProvider>
            <GnssProvider>
              <View style={{ flex: 1 }}>
                <NavigationContainer>
                <Tab.Navigator
                  initialRouteName="Dashboard"
                  screenOptions={{
                    headerTitleAlign: "center",
                    headerStyle: { backgroundColor: theme.colors.bg },
                      headerTitleStyle: { color: theme.colors.text },
                      tabBarStyle: {
                        backgroundColor: theme.colors.bg,
                        borderTopColor: theme.colors.border,
                        height: 62,
                        paddingTop: 6,
                        paddingBottom: 8,
                      },
                      tabBarLabelStyle: {
                        fontSize: 11,
                        fontWeight: "700",
                      },
                      tabBarActiveTintColor: theme.colors.primary,
                      tabBarInactiveTintColor: theme.colors.muted,
                    }}
                  >
                    <Tab.Screen
                      name="Charging"
                      component={ChargingScreen}
                      options={{
                        tabBarIcon: ({ color, size }) => (
                          <Ionicons name="flash-outline" color={color} size={size} />
                        ),
                      }}
                    />
                    <Tab.Screen
                      name="Ride"
                      component={RideScreen}
                      options={{
                        tabBarIcon: ({ color, size }) => (
                          <Ionicons name="speedometer-outline" color={color} size={size} />
                        ),
                      }}
                    />
                    <Tab.Screen
                      name="Dashboard"
                      component={DashboardScreen}
                      options={{
                        tabBarIcon: ({ color, size }) => (
                          <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} />
                        ),
                      }}
                    />
                    <Tab.Screen
                      name="Location"
                      component={LocationScreen}
                      options={{
                        tabBarIcon: ({ color, size }) => (
                          <Ionicons name="location-outline" color={color} size={size} />
                        ),
                      }}
                    />
                    <Tab.Screen
                      name="Diagnostics"
                      component={DiagnosticsScreen}
                      options={{
                        tabBarIcon: ({ color, size }) => (
                          <Ionicons name="warning-outline" color={color} size={size} />
                        ),
                      }}
                    />
                    <Tab.Screen
                      name="BLE"
                      component={BleSendScreen}
                      options={{
                        tabBarIcon: ({ color, size }) => (
                          <Ionicons name="bluetooth-outline" color={color} size={size} />
                        ),
                      }}
                    />
                  </Tab.Navigator>
                </NavigationContainer>
                <PauseOverlay />
              </View>
            </GnssProvider>
          </ConnectionProvider>
        </TelemetryProvider>
      </RideSessionProvider>
    </PauseProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});

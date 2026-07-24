import React, { useState, useCallback, useMemo } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';
import { setUserProfile } from '../utils/storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 🔴 UBAH INI ke base URL Node.js backend
const API_BASE_URL = 'https://dapur.mealify.id/api';

export default function LoginScreen({ onLoginSuccess, isDark }) {
    const theme = useMemo(() => ({
        background: isDark ? '#0F172A' : '#FFFFFF',
        card: isDark ? '#1E293B' : '#F0F9FF',
        primary: '#0EA5E9',
        text: isDark ? '#F8FAFC' : '#0F172A',
        textMuted: isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#1E293B' : '#E0F2FE',
        modalBg: isDark ? '#1A1A24' : '#FFFFFF',
    }), [isDark]);

    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'error',
        onOk: null
    });

    const showAlert = (title, message, type = 'error', onOk = null) => {
        setAlertConfig({ visible: true, title, message, type, onOk });
    };

    const hideAlert = () => {
        const callback = alertConfig.onOk;
        setAlertConfig(prev => ({ ...prev, visible: false }));
        if (callback) callback();
    };

    // 🔐 Simpan token JWT untuk dipakai di API call berikutnya
    const saveToken = async (token) => {
        await AsyncStorage.setItem('jwt_token', token);
        console.log('[Login] Token JWT tersimpan');
    };

    const handleAuth = async () => {
        const cleanPhoneInput = phone.trim().replace(/\s+/g, '');

        if (cleanPhoneInput.length < 10) {
            showAlert('Input Tidak Valid', 'Masukkan nomor HP minimal 10 digit untuk melanjutkan.');
            return;
        }

        setLoading(true);

        try {
            // 🔴 BAGIAN YANG DIUBAH: endpoint Node.js (dapur.mealify.id)
            const response = await fetch(`${API_BASE_URL}/auth/login-phone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    phone: cleanPhoneInput,
                }),
            });

            const responseJson = await response.json();

            // ❌ Jika response bukan 2xx (error dari server)
            if (!response.ok) {
                setLoading(false);
                showAlert('Gagal Login', responseJson.error || responseJson.solusi || `Status: ${response.status}`);
                return;
            }

            // ✅ Login berhasil — response dari Node.js:
            // {
            //   "token": "eyJhbGciOiJIUzI1NiIs...",
            //   "user": { "id": 1, "phone": "081234567890", "nama": "Budi", "role": "karyawan" },
            //   "karyawan": { "id": 5, "nama": "Budi Santoso", "nik": "KRY-001", "departemen": "Produksi" }
            // }

            const { token, user, karyawan } = responseJson;

            // Simpan token untuk request berikutnya
            if (token) {
                await saveToken(token);
            }

            // Mapping data dari Node.js ke format yang dibutuhkan aplikasi
            const userData = {
                id: karyawan?.id,
                dbUserId: user?.id,
                name: karyawan?.nama || user?.nama,
                role: user?.role || 'karyawan',
                positionName: karyawan?.departemen || '',
                position_id: null,
                shift_id: null,
                shift_name: null,
                shift_start: null,
                shift_end: null,
                employeeId: karyawan?.nik || '',
                email: '', // Bisa diisi dari endpoint profile nanti
                phone: user?.phone || cleanPhoneInput,
                photoUrl: null,
                isBound: false,
                boundDeviceId: null,
                kitchen_id: null,
                isFaceRequired: false,
                baseSalary: 'Rp 0',
                // 🔑 Field tambahan untuk Node.js backend
                token: token,
                tenant_id: user?.tenant_id || null,
            };

            await setUserProfile(userData);
            setLoading(false);
            onLoginSuccess();

        } catch (err) {
            setLoading(false);
            console.error('[Login Auth Error]', err);
            if (err.message && err.message.includes('UnknownHostException')) {
                showAlert('Gagal Terhubung', 'Tidak dapat menemukan alamat server (dapur.mealify.id). Pastikan koneksi internet Anda aktif.');
            } else if (err.message && err.message.includes('ConnectException')) {
                showAlert('Gagal Terhubung', 'Tidak dapat menjangkau server (dapur.mealify.id). Pastikan koneksi internet Anda aktif.');
            } else {
                showAlert('Gagal Terhubung', 'Terjadi kesalahan sistem atau masalah koneksi. Silakan coba lagi.');
            }
        }
    };

    return (
        <KeyboardAvoidingView
            behavior="padding"
            style={[styles.container, { backgroundColor: theme.background }]}
        >
            {/* Custom Modal Alert */}
            <Modal
                visible={alertConfig.visible}
                transparent={true}
                animationType="fade"
                onRequestClose={hideAlert}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.alertBox, { backgroundColor: theme.modalBg, borderColor: theme.border }]}>
                        <View style={[
                            styles.alertIconCircle,
                            { backgroundColor: alertConfig.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)' }
                        ]}>
                            <Ionicons
                                name={alertConfig.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
                                size={40}
                                color={alertConfig.type === 'error' ? COLORS.danger : COLORS.secondary}
                            />
                        </View>
                        <Text style={[styles.alertTitle, { color: theme.text }]}>{alertConfig.title}</Text>
                        <Text style={[styles.alertMessage, { color: theme.textMuted }]}>{alertConfig.message}</Text>
                        <TouchableOpacity
                            style={[styles.alertBtn, { backgroundColor: alertConfig.type === 'error' ? COLORS.danger : COLORS.secondary }]}
                            onPress={hideAlert}
                        >
                            <Text style={styles.alertBtnText}>Mengerti</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={styles.inner}>
                <View style={styles.logoContainer}>
                    <View style={[styles.logoCircle, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Ionicons name="shield-checkmark" size={60} color={theme.primary} />
                    </View>
                    <Text style={[styles.titleText, { color: theme.text }]}>MASUK<Text style={{ color: theme.primary }}> AKUN</Text></Text>
                    <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                        Gunakan nomor HP yang sudah terdaftar.
                    </Text>
                </View>

                <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.label, { color: theme.text }]}>Nomor Handphone</Text>
                    <View style={[styles.inputContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <Ionicons name="call-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
                        <TextInput
                            style={[styles.input, { color: theme.text }]}
                            placeholder="0812xxxx"
                            placeholderTextColor={theme.textMuted}
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                        />
                    </View>
                    <Text style={[styles.helperText, { color: theme.textMuted }]}>
                        Pastikan nomor HP Anda sudah pernah didaftarkan oleh administrator sebelumnya.
                    </Text>

                    <TouchableOpacity
                        style={[styles.loginBtn, loading && { opacity: 0.7 }]}
                        onPress={handleAuth}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={COLORS.background} />
                        ) : (
                            <Text style={[styles.loginBtnText, { color: '#FFFFFF' }]}>MASUK SEKARANG</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: theme.textMuted }]}>SPPG SUKALUYU TAMANSARI</Text>
                </View>
            </View>
        </KeyboardAvoidingView >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    inner: { flex: 1, padding: 24, justifyContent: 'center' },
    logoContainer: { alignItems: 'center', marginBottom: 40 },
    logoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
    titleText: { fontSize: 28, fontWeight: 'bold', color: COLORS.textPrimary, letterSpacing: 2 },
    subtitle: { color: COLORS.textMuted, marginTop: 8, textAlign: 'center', fontSize: 14 },
    formCard: { backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
    label: { color: COLORS.textPrimary, fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, height: 50, color: COLORS.textPrimary, fontSize: 15 },
    helperText: { color: COLORS.textMuted, fontSize: 12, marginTop: 12, lineHeight: 18 },
    loginBtn: { backgroundColor: COLORS.primary, height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 24, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    loginBtnText: { color: COLORS.background, fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
    switchModeBtn: { marginTop: 20, alignItems: 'center' },
    switchModeText: { color: COLORS.primaryLight, fontSize: 14, fontWeight: '600' },

    footer: { marginTop: 40, alignItems: 'center' },
    footerText: { color: COLORS.textMuted, fontSize: 10, fontWeight: 'bold', letterSpacing: 2, opacity: 0.6 },

    // Custom Alert Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    alertBox: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: COLORS.cardBg,
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    alertIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    alertTitle: {
        color: COLORS.textPrimary,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: 0.5
    },
    alertMessage: {
        color: COLORS.textSecondary,
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
        paddingHorizontal: 10
    },
    alertBtn: {
        width: '100%',
        height: 55,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    alertBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 }
});

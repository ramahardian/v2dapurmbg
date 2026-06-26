async function renderAkun() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/akun', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();

    let fotoBase64 = null;
    const fotoInput = document.getElementById('foto-input');
    const fotoPreview = document.getElementById('foto-preview');
    const fotoInitials = document.getElementById('foto-initials');
    const hapusBtn = document.getElementById('btn-hapus-foto');

    fotoInput.onchange = function() {
      const file = this.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return showAlert('Maks 2MB', 'warning');
      const reader = new FileReader();
      reader.onload = function(e) {
        fotoBase64 = e.target.result;
        fotoPreview.innerHTML = '<img src="' + fotoBase64 + '" class="w-full h-full object-cover" />';
        hapusBtn.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    };

    hapusBtn.onclick = function() {
      fotoBase64 = 'hapus';
      fotoPreview.innerHTML = '<span id="foto-initials" class="text-3xl font-bold text-stone-400">' + (document.getElementById('akun-nama').value.split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?') + '</span>';
      hapusBtn.classList.add('hidden');
    };

    document.getElementById('btn-simpan-profil').onclick = async function() {
      var nama = document.getElementById('akun-nama').value.trim();
      var email = document.getElementById('akun-email').value.trim();
      if (!nama) return showAlert('Nama tidak boleh kosong', 'warning');
      if (!email) return showAlert('Email tidak boleh kosong', 'warning');
      try {
        var payload = { nama: nama, email: email };
        if (fotoBase64) payload.foto = fotoBase64;
        var res = await api.put('/auth/profile', payload);
        document.getElementById('user-name').textContent = nama;
        if (res.user && res.user.foto) {
          document.getElementById('user-avatar').innerHTML = '<img src="' + res.user.foto + '" class="w-full h-full object-cover" />';
        }
        fotoBase64 = null;
        showToast('Profil berhasil diperbarui', 'success');
      } catch (e) {
        showAlert(e.message || 'Gagal simpan profil', 'error');
      }
    };

    document.getElementById('btn-ganti-password').onclick = async function() {
      var password_lama = document.getElementById('akun-pass-lama').value;
      var password_baru = document.getElementById('akun-pass-baru').value;
      if (!password_lama) return showAlert('Masukkan password lama', 'warning');
      if (!password_baru || password_baru.length < 6) return showAlert('Password baru minimal 6 karakter', 'warning');
      try {
        await api.put('/auth/password', { password_lama: password_lama, password_baru: password_baru });
        document.getElementById('akun-pass-lama').value = '';
        document.getElementById('akun-pass-baru').value = '';
        showToast('Password berhasil diganti', 'success');
      } catch (e) {
        showAlert(e.message || 'Gagal ganti password', 'error');
      }
    };
  } catch (err) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}
let _akunFotoBase64 = null;
let _akunFotoHapus = false;

async function renderAkun() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="flex items-center justify-center py-24"><svg class="animate-spin h-10 w-10 text-[#1e40af]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg></div>';
  try {
    const r = await fetch('/api/template/akun', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();

    _akunFotoBase64 = null;
    _akunFotoHapus = false;

    // Photo upload
    document.getElementById('akun-foto-input').onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showAlert('Ukuran foto maksimal 2MB', 'warning'); e.target.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function(ev) {
        _akunFotoBase64 = ev.target.result;
        _akunFotoHapus = false;
        var preview = document.getElementById('akun-foto-preview');
        preview.innerHTML = '<img src="' + _akunFotoBase64 + '" class="w-full h-full object-cover">';
        document.getElementById('akun-foto-hapus').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    };

    // Photo delete
    document.getElementById('akun-foto-hapus').onclick = function() {
      _akunFotoBase64 = null;
      _akunFotoHapus = true;
      var preview = document.getElementById('akun-foto-preview');
      var initial = document.getElementById('akun-nama').value.trim().charAt(0).toUpperCase() || '?';
      preview.innerHTML = '<span class="text-lg font-bold text-stone-500">' + initial + '</span>';
      document.getElementById('akun-foto-hapus').classList.add('hidden');
      document.getElementById('akun-foto-input').value = '';
    };

    document.getElementById('btn-simpan-profil').onclick = async function() {
      var nama = document.getElementById('akun-nama').value.trim();
      var email = document.getElementById('akun-email').value.trim();
      if (!nama) return showAlert('Nama tidak boleh kosong', 'warning');
      if (!email) return showAlert('Email tidak boleh kosong', 'warning');
      var body = { nama: nama, email: email };
      if (_akunFotoHapus) body.foto = 'hapus';
      else if (_akunFotoBase64) body.foto = _akunFotoBase64;
      try {
        var result = await api.put('/auth/profile', body);
        document.getElementById('user-name').textContent = nama;
        akunUpdateNavbarFoto(result.user?.foto || null);
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

function akunUpdateNavbarFoto(fotoUrl) {
  var avatar = document.getElementById('user-avatar');
  if (!avatar) return;
  if (fotoUrl) {
    avatar.innerHTML = '<img src="' + fotoUrl + '" class="w-full h-full object-cover">';
  } else {
    var nama = document.getElementById('akun-nama')?.value?.trim() || currentUser?.nama || '?';
    avatar.innerHTML = '<span class="text-xs font-bold">' + nama.charAt(0).toUpperCase() + '</span>';
  }
}
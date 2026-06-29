let userEditing = null;

async function renderKelolaUser() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="animate-pulse space-y-3 p-4 sm:p-6"><div class="h-8 bg-stone-200 rounded w-1/3"></div><div class="h-4 bg-stone-100 rounded w-full"></div><div class="h-4 bg-stone-100 rounded w-5/6"></div><div class="h-4 bg-stone-100 rounded w-4/5"></div><div class="h-4 bg-stone-100 rounded w-3/4"></div><div class="h-4 bg-stone-100 rounded w-11/12"></div><div class="h-4 bg-stone-100 rounded w-2/3"></div></div>';
  try {
    const r = await fetch('/api/template/kelola-user', { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Gagal memuat');
    c.innerHTML = await r.text();
    document.getElementById('btn-tambah-user').onclick = () => openUserForm(null);
    document.getElementById('btn-simpan-user').onclick = simpanUser;
    loadUsers();
  } catch (err) {
    c.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Gagal memuat: ' + err.message + '</div>';
  }
}

async function loadUsers() {
  try {
    const rows = await api.get('/users');
    const tbody = document.getElementById('user-table-body');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-stone-400">Belum ada user</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(u) {
      var tanggal = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
      return '<tr class="border-t border-stone-100">' +
        '<td class="px-4 py-3 text-sm">' + (u.nama || '') + '</td>' +
        '<td class="px-4 py-3 text-sm text-stone-500">' + (u.email || '') + '</td>' +
        '<td class="px-4 py-3 text-sm capitalize">' + u.role.replace('_', ' ') + '</td>' +
        '<td class="px-4 py-3 text-sm text-stone-500">' + tanggal + '</td>' +
        '<td class="px-4 py-3 text-sm text-right whitespace-nowrap">' +
          '<button onclick="openUserForm(' + u.id + ')" class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3">Edit</button>' +
          '<button onclick="hapusUser(' + u.id + ')" class="text-red-600 hover:text-red-800 text-xs font-medium">Hapus</button>' +
        '</td></tr>';
    }).join('');
  } catch (e) {
    showAlert('Gagal load user: ' + e.message, 'error');
  }
}

function openUserForm(id) {
  userEditing = id;
  document.getElementById('user-modal-title').textContent = id ? 'Edit User' : 'Tambah User';
  document.getElementById('user-id').value = id || '';
  document.getElementById('user-nama').value = '';
  document.getElementById('user-email').value = '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-role').value = 'produksi';
  var passLabel = document.getElementById('pass-label');
  if (id) {
    passLabel.textContent = '(kosongkan jika tidak diganti)';
    // Load existing data via API
    api.get('/users').then(function(rows) {
      var u = rows.find(function(r) { return r.id === id; });
      if (!u) return;
      document.getElementById('user-nama').value = u.nama;
      document.getElementById('user-email').value = u.email;
      document.getElementById('user-role').value = u.role;
    });
  } else {
    passLabel.textContent = '*';
  }
  document.getElementById('user-modal').classList.remove('hidden');
  document.getElementById('user-modal').classList.add('flex');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
  document.getElementById('user-modal').classList.remove('flex');
}

async function simpanUser() {
  var id = document.getElementById('user-id').value;
  var nama = document.getElementById('user-nama').value.trim();
  var email = document.getElementById('user-email').value.trim();
  var password = document.getElementById('user-password').value;
  var role = document.getElementById('user-role').value;
  if (!nama) return showAlert('Nama wajib diisi', 'warning');
  if (!email) return showAlert('Email wajib diisi', 'warning');
  if (!id && (!password || password.length < 6)) return showAlert('Password minimal 6 karakter', 'warning');
  try {
    if (id) {
      var payload = { nama: nama, email: email, role: role };
      if (password) payload.password = password;
      await api.put('/users/' + id, payload);
      showToast('User diperbarui', 'success');
    } else {
      await api.post('/users', { nama: nama, email: email, password: password, role: role });
      showToast('User ditambahkan', 'success');
    }
    closeUserModal();
    loadUsers();
  } catch (e) {
    showAlert(e.message || 'Gagal simpan user', 'error');
  }
}

async function hapusUser(id) {
  if (!await showConfirm('Hapus user ini?')) return;
  try {
    await api.del('/users/' + id);
    showToast('User dihapus', 'success');
    loadUsers();
  } catch (e) {
    showAlert(e.message || 'Gagal hapus user', 'error');
  }
}
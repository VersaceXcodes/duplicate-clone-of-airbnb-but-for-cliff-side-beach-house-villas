import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { useAppStore } from "@/store/main";

import type {
  Villa,
  VillaPhoto,
  Amenity,
  VillaAmenity,
  VillaAvailability,
  UpdateVillaInput,
} from "@schema/zodschemas";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function getAuthHeaders(token?: string | null) {
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

// Helpers for confirmation dialogs
function confirmDialog(msg: string): Promise<boolean> {
  return Promise.resolve(window.confirm(msg));
}
// Sanitize strings for minimal display
function s(txt: string | null | undefined): string {
  return txt ? String(txt) : "";
}

const TABS = [
  { id: "details", label: "Details" },
  { id: "photos", label: "Photos" },
  { id: "amenities", label: "Amenities" },
  { id: "calendar", label: "Calendar" },
  { id: "pricing_rules", label: "Pricing & Rules" },
];

const cancellationPolicies = [
  "flexible",
  "moderate",
  "strict",
];

const statusOptions = [
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Unpublished" },
];

export const UV_HostEditListing: React.FC = () => {
  // -------- Global State --------
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_error_state = useAppStore((s) => s.set_error_state);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);

  // -------- Router Params --------
  const params = useParams<{ villa_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // -------- Local State --------
  const [activeTab, setActiveTab] = useState<"details"|"photos"|"calendar"|"amenities"|"pricing_rules">("details");
  // Editing form state (merged for submit)
  const [form, setForm] = useState<Partial<UpdateVillaInput>>({});
  const [formTouched, setFormTouched] = useState(false);

  // Error and focus
  const [error, setError] = useState<string|null>(null);
  const errorRef = useRef<HTMLDivElement|null>(null);

  // Modals for dangerous actions
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);

  // For Photos
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string|null>(null);

  // For Amenities
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  // For Availability
  const [calendarDateInput, setCalendarDateInput] = useState(""); // yyyy-mm-dd
  const [calendarBlockType, setCalendarBlockType] = useState<"block"|"unblock">("block");

  // --------------- Fetch Villa ------------
  const {
    data: villa,
    isLoading: isVillaLoading,
    isError: isVillaError,
    error: villaError,
    refetch: refetchVilla,
  } = useQuery<Villa, Error>({
    queryKey: ["villa", params.villa_id],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}`,
        { headers: getAuthHeaders(auth_token) }
      );
      return data;
    },
    enabled: !!params.villa_id && !!auth_token,
  });

  // --------------- Fetch Villa Photos ------------
  const {
    data: villaPhotos,
    isLoading: isPhotosLoading,
    refetch: refetchPhotos,
  } = useQuery<VillaPhoto[]>({
    queryKey: ["villa_photos", params.villa_id],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}/photos`,
        { headers: getAuthHeaders(auth_token) }
      );
      return data;
    },
    enabled: !!params.villa_id && !!auth_token,
  });

  // ------------ Fetch all Amenities --------------
  const {
    data: amenities,
    isLoading: isAmenitiesLoading,
  } = useQuery<Amenity[]>({
    queryKey: ["amenities"],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/amenities?limit=100`,
        { headers: getAuthHeaders(auth_token) }
      );
      return data;
    },
    enabled: !!auth_token,
  });

  // ---------- Fetch Amenities assigned to Villa -------
  const {
    data: villaAmenities,
    isLoading: isVillaAmenitiesLoading,
    refetch: refetchVillaAmenities,
  } = useQuery<VillaAmenity[]>({
    queryKey: ["villa_amenities", params.villa_id],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/villa-amenities?villa_id=${encodeURIComponent(params.villa_id ?? "")}`,
        { headers: getAuthHeaders(auth_token) }
      );
      return data;
    },
    enabled: !!params.villa_id && !!auth_token,
  });

  // ------------ Fetch Villa Availability (Calendar) ----------
  const {
    data: availabilities,
    isLoading: isCalendarLoading,
    refetch: refetchAvail,
  } = useQuery<VillaAvailability[]>({
    queryKey: ["villa_availability", params.villa_id],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}/availability`,
        { headers: getAuthHeaders(auth_token) }
      );
      return data;
    },
    enabled: !!params.villa_id && !!auth_token,
  });

  // ----------- Initial Data Setup (on villa fetch) ----------
  useEffect(() => {
    if (villa) {
      setForm({
        villa_id: villa.villa_id,
        host_user_id: villa.host_user_id,
        name: villa.name,
        subtitle: villa.subtitle || "",
        location: villa.location,
        lat: villa.lat,
        lng: villa.lng,
        address: villa.address || "",
        description: villa.description,
        house_rules: villa.house_rules || "",
        special_notes: villa.special_notes || "",
        amenities: villa.amenities,
        price_per_night: villa.price_per_night,
        cleaning_fee: villa.cleaning_fee,
        service_fee: villa.service_fee,
        minimum_stay_nights: villa.minimum_stay_nights,
        cancellation_policy: villa.cancellation_policy,
        status: villa.status,
        occupancy: villa.occupancy,
      });
    }
  }, [villa]);

  // ----------- Set initial amenities (from villaAmenities) ----------
  useEffect(() => {
    if (villaAmenities) {
      setSelectedAmenities(
        villaAmenities.map((a) => a.amenity_slug)
      );
    }
  }, [villaAmenities]);

  // ------------ Photos: Local preview for new uploads ------------
  useEffect(() => {
    // revoke previous
    uploadPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setUploadPreviewUrls(photoFiles.map(f => URL.createObjectURL(f)));
    // Cleanup on unmount
    return () => {
      uploadPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line
  }, [photoFiles]);

  // -------- Tab change resets error -----------
  useEffect(() => {
    setError(null);
  }, [activeTab]);

  // ---- Aggregate loading ---
  const isAnyLoading = isVillaLoading || isPhotosLoading || isAmenitiesLoading || isVillaAmenitiesLoading || isCalendarLoading;

  // ------- Form change helpers -----------
  const updateForm = (fields: Partial<UpdateVillaInput>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    setFormTouched(true);
    setError(null);
  };

  // ------- Villa Update Mutation -----------
  const updateVillaMut = useMutation({
    mutationFn: async (payload: UpdateVillaInput) => {
      set_loader_state({ is_loading: true, context: "villa_save" });
      const { data } = await axios.put(
        `${API_BASE}/villas/${encodeURIComponent(payload.villa_id)}`,
        payload,
        { headers: { ...getAuthHeaders(auth_token), "Content-Type": "application/json" } }
      );
      return data as Villa;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["villa", params.villa_id] });
      await queryClient.invalidateQueries({ queryKey: ["villa_amenities", params.villa_id] });
      setFormTouched(false);
      setError(null);
      reset_loader_state();
      queryClient.invalidateQueries({ queryKey: ["villa"] });
      window.scrollTo({ top: 0 });
    },
    onError: (err: any) => {
      reset_loader_state();
      setError("Error saving villa: " + (err?.response?.data?.error || err.message));
    },
  });

  // ------- Amenities: assign/remove --------
  const addAmenityMut = useMutation({
    mutationFn: async (slug: string) => {
      await axios.post(
        `${API_BASE}/villa-amenities`,
        { villa_id: params.villa_id, amenity_slug: slug },
        { headers: { ...getAuthHeaders(auth_token), "Content-Type": "application/json" } }
      );
    },
    onSuccess: () => {
      refetchVillaAmenities();
    },
  });
  const removeAmenityMut = useMutation({
    mutationFn: async (slug: string) => {
      await axios.delete(
        `${API_BASE}/villa-amenities?villa_id=${encodeURIComponent(params.villa_id ?? "")}&amenity_slug=${encodeURIComponent(slug)}`,
        { headers: getAuthHeaders(auth_token) }
      );
    },
    onSuccess: () => {
      refetchVillaAmenities();
    },
  });

  // ------- Photos: upload/delete/reorder ------
  const uploadPhotoMut = useMutation({
    mutationFn: async (file: File) => {
      // For MVP, we'll "upload" to a random picsum url; in real, would upload to S3 and get URL
      // Simulate file upload by using local preview as the fake URL
      // TODO: Integrate real image uploading in production!
      const now = Date.now();
      const fakeUrl = `https://picsum.photos/seed/villa${now + Math.floor(Math.random()*99999)}/800/600`;
      // sort_order = (current photos count or 0) + 1
      const sort_order = (villaPhotos?.length || 0) + 1;
      const payload = { villa_id: params.villa_id, url: fakeUrl, sort_order };
      const { data } = await axios.post(`${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}/photos`, payload, {
        headers: { ...getAuthHeaders(auth_token), "Content-Type": "application/json" }
      });
      return data as VillaPhoto;
    },
    onSuccess: async () => {
      await refetchPhotos();
      setPhotoFiles([]);
      setUploadPreviewUrls([]);
    },
    onError: (err: any) => {
      setPhotoError("Photo upload failed: " + (err?.response?.data?.error || err.message));
    },
  });
  const deletePhotoMut = useMutation({
    mutationFn: async (photo_id: string) => {
      await axios.delete(
        `${API_BASE}/villa-photos/${encodeURIComponent(photo_id)}`,
        { headers: getAuthHeaders(auth_token) }
      );
    },
    onSuccess: () => {
      refetchPhotos();
    }
  });

  // ------ Calendar: Add/Remove/Block/Unblock -------
  const setAvailabilityMut = useMutation({
    mutationFn: async (dateVal: { date: string, is_available: boolean, is_blocked: boolean }) => {
      await axios.post(
        `${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}/availability`,
        { villa_id: params.villa_id, ...dateVal },
        { headers: { ...getAuthHeaders(auth_token), "Content-Type": "application/json" } }
      );
    },
    onSuccess: () => {
      refetchAvail();
      setCalendarDateInput("");
      setError(null);
    },
    onError: (err: any) => {
      setError("Failed to set calendar date: " + (err?.response?.data?.error || err.message));
    }
  });
  const deleteAvailMut = useMutation({
    mutationFn: async (availability_id: string) => {
      await axios.delete(
        `${API_BASE}/villa-availability/${encodeURIComponent(availability_id)}`,
        { headers: getAuthHeaders(auth_token) }
      );
    },
    onSuccess: () => {
      refetchAvail();
    },
    onError: (err: any) => {
      setError("Failed to remove calendar entry");
    }
  });

  // --------- Dangerous actions: unpublish/delete ----------
  const patchVillaStatusMut = useMutation({
    mutationFn: async (newStatus: string) => {
      set_loader_state({ is_loading: true });
      const { data } = await axios.patch(
        `${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}`,
        { villa_id: params.villa_id, status: newStatus },
        { headers: { ...getAuthHeaders(auth_token), "Content-Type": "application/json" } }
      );
      return data as Villa;
    },
    onSuccess: () => {
      refetchVilla();
      reset_loader_state();
      setShowUnpublishDialog(false);
    },
    onError: (err: any) => {
      setError("Failed to change status");
      reset_loader_state();
    }
  });
  const deleteVillaMut = useMutation({
    mutationFn: async () => {
      set_loader_state({ is_loading: true });
      await axios.delete(
        `${API_BASE}/villas/${encodeURIComponent(params.villa_id ?? "")}`,
        { headers: getAuthHeaders(auth_token) }
      );
    },
    onSuccess: () => {
      reset_loader_state();
      setShowDeleteDialog(false);
      navigate("/dashboard/host");
    },
    onError: () => {
      setError("Failed to delete villa");
      reset_loader_state();
    }
  });

  // -------- Amenities Checkbox Handler ----------
  const handleAmenityToggle = (slug: string) => {
    let isCurrentlyChecked = selectedAmenities.includes(slug);
    setSelectedAmenities((prev) =>
      isCurrentlyChecked
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
    setFormTouched(true);
    setError(null);
    if (!isCurrentlyChecked) {
      addAmenityMut.mutate(slug);
    } else {
      removeAmenityMut.mutate(slug);
    }
  };

  // -------- Photos handler ---------
  const handlePhotoFileInput = (evt: React.ChangeEvent<HTMLInputElement>) => {
    if (!evt.target.files) return;
    const files = Array.from(evt.target.files);
    // Limit number of files per upload to 5 (and max 20 total)
    if ((villaPhotos?.length ?? 0) + files.length > 20) {
      setPhotoError("You can only have up to 20 photos.");
      return;
    }
    setPhotoFiles(files.slice(0, 5));
    setPhotoError(null);
  };
  const submitPhotoUpload = () => {
    if (!photoFiles.length) {
      setPhotoError("Please select file(s)");
      return;
    }
    for (let f of photoFiles) {
      uploadPhotoMut.mutate(f);
    }
  };
  const removePhoto = (photo_id: string) => {
    deletePhotoMut.mutate(photo_id);
  };

  // ----------- Save Button handler -------------
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Compose amenities as comma-separated string for backend
    const amenitiesCsv = selectedAmenities.join(",");
    // Merge edited form
    const updatePayload: UpdateVillaInput = {
      ...form,
      villa_id: params.villa_id!,
      amenities: amenitiesCsv
    };
    // Validate required fields
    if (!updatePayload.name || !updatePayload.location || !updatePayload.description || !updatePayload.price_per_night || Number(updatePayload.price_per_night) <= 0) {
      setError("Please fill all required fields and valid prices.");
      return;
    }
    setError(null);
    updateVillaMut.mutate(updatePayload);
  };

  // ----------- Dangerous: Unpublish/Delete ---------------
  const handleUnpublish = async () => {
    setShowUnpublishDialog(false);
    patchVillaStatusMut.mutate("unpublished");
  };
  const handleDelete = async () => {
    setShowDeleteDialog(false);
    deleteVillaMut.mutate();
  };

  // ----------- Focus to error msg ---------------
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // ----------- Only hosts who own the villa ---------
  if (villa && user && villa.host_user_id !== user.user_id) {
    return (
      <div className="max-w-2xl mx-auto mt-16 p-6 border rounded shadow text-red-700 bg-red-50">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p>You do not have permission to edit this listing.</p>
        <Link className="inline-block mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" to="/dashboard/host">Back to Host Dashboard</Link>
      </div>
    );
  }

  // -------------------------------------------------
  // ------------------- RENDER ----------------------
  // -------------------------------------------------
  return (
    <>
      <div className="max-w-4xl mx-auto mt-10 p-4 md:p-6 bg-white rounded shadow">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold flex gap-2 items-center">
              Edit Listing
              {villa &&
                <span className={`px-2 py-0.5 rounded text-xs ml-2 ${
                    villa.status === "published" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                  {villa.status}
                </span>
              }
            </h1>
            <p className="text-sm text-gray-500 mb-1">Villa ID: <b>{params.villa_id}</b></p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowUnpublishDialog(true)}
              disabled={isAnyLoading || villa?.status === "unpublished"}
              className="px-3 py-1 border border-yellow-400 text-yellow-700 bg-yellow-50 rounded hover:bg-yellow-100 focus:ring focus:ring-yellow-300"
              aria-label="Unpublish listing"
            >
              Unpublish
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isAnyLoading}
              className="px-3 py-1 border border-red-600 text-red-700 bg-red-50 rounded hover:bg-red-100 focus:ring focus:ring-red-400"
              aria-label="Delete listing permanently"
            >
              Delete
            </button>
          </div>
        </div>
        {/* Confirm Dialogs */}
        {showUnpublishDialog && (
          <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" role="dialog" tabIndex={-1}>
            <div className="bg-white rounded shadow-lg max-w-xs p-6">
              <h2 className="font-bold text-lg mb-2">Unpublish Listing?</h2>
              <p className="mb-4">Your listing will be removed from search and unavailable for booking. Active bookings are NOT affected.</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowUnpublishDialog(false)}
                  className="px-3 py-1 rounded border bg-gray-100 hover:bg-gray-200"
                >Cancel</button>
                <button
                  onClick={handleUnpublish}
                  className="px-3 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600"
                >Confirm</button>
              </div>
            </div>
          </div>
        )}
        {showDeleteDialog && (
          <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" role="dialog" tabIndex={-1}>
            <div className="bg-white rounded shadow-lg max-w-xs p-6">
              <h2 className="font-bold text-lg mb-2 text-red-700">Delete Listing?</h2>
              <p className="mb-4">Warning: This will <b>permanently delete</b> your listing and all active/future bookings may be auto-canceled. Are you sure?</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  className="px-3 py-1 rounded border bg-gray-100 hover:bg-gray-200"
                >Cancel</button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                >Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Error Messages */}
        {(error || updateVillaMut.error) && (
          <div
            className="bg-red-100 text-red-800 px-4 py-2 mb-2 rounded"
            role="alert"
            aria-live="polite"
            ref={errorRef}
            tabIndex={-1}
          >{error || updateVillaMut.error?.message}</div>
        )}
        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6 mt-4 border-b">
          {TABS.map(tab =>
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-2 px-2 border-b-2 transition whitespace-nowrap ${activeTab === tab.id ? "border-blue-600 font-bold" : "border-transparent text-gray-500"} focus:outline-none`}
              tabIndex={0}
              aria-label={tab.label}
            >
              {tab.label}
            </button>
          )}
        </div>
        {/* Tab Content */}
        {activeTab === "details" && (
          <form autoComplete="off" onSubmit={handleSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="font-semibold block mb-1">
                  Name<span className="text-red-500">*</span>
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="text"
                    value={form.name || ""}
                    onChange={e => updateForm({ name: e.target.value })}
                    required
                    maxLength={255}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Subtitle
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="text"
                    value={form.subtitle || ""}
                    onChange={e => updateForm({ subtitle: e.target.value })}
                    maxLength={255}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Location<span className="text-red-500">*</span>
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="text"
                    value={form.location || ""}
                    onChange={e => updateForm({ location: e.target.value })}
                    required
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Address
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="text"
                    value={form.address || ""}
                    onChange={e => updateForm({ address: e.target.value })}
                    maxLength={255}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Latitude
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    step="0.0001"
                    value={form.lat ?? ""}
                    onChange={e => updateForm({ lat: Number(e.target.value) })}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Longitude
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    step="0.0001"
                    value={form.lng ?? ""}
                    onChange={e => updateForm({ lng: Number(e.target.value) })}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Occupancy<span className="text-red-500">*</span>
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    min={1}
                    max={32}
                    value={form.occupancy ?? ""}
                    onChange={e => updateForm({ occupancy: Number(e.target.value) })}
                    required
                  />
                </label>
              </div>
              <div>
                <label className="font-semibold block mb-1">
                  Description<span className="text-red-500">*</span>
                  <textarea
                    className="block w-full mt-1 p-2 border rounded h-36 resize-vertical"
                    value={form.description || ""}
                    onChange={e => updateForm({ description: e.target.value })}
                    required
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  House Rules
                  <textarea
                    className="block w-full mt-1 p-2 border rounded h-24 resize-vertical"
                    value={form.house_rules || ""}
                    onChange={e => updateForm({ house_rules: e.target.value })}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Special Notes
                  <textarea
                    className="block w-full mt-1 p-2 border rounded h-20 resize-vertical"
                    value={form.special_notes || ""}
                    onChange={e => updateForm({ special_notes: e.target.value })}
                  />
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800"
                disabled={isAnyLoading}
                aria-label="Save Listing Details"
              >
                Save
              </button>
              <Link to="/dashboard/host" className="px-5 py-2 border border-gray-400 rounded bg-gray-50 hover:bg-gray-100" tabIndex={0}>
                Cancel
              </Link>
            </div>
          </form>
        )}

        {activeTab === "photos" && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="file"
                accept="image/*"
                multiple
                aria-label="Add photo(s)"
                onChange={handlePhotoFileInput}
                className="block"
              />
              <button
                type="button"
                className="px-3 py-1 border bg-blue-100 rounded hover:bg-blue-200"
                onClick={submitPhotoUpload}
                disabled={!photoFiles.length || isAnyLoading}
                aria-label="Upload selected photo(s)"
              >
                Upload
              </button>
              {photoError && <span className="text-red-600 text-sm">{photoError}</span>}
            </div>
            {uploadPreviewUrls.length > 0 &&
              <div className="flex gap-2 mb-2">
                {uploadPreviewUrls.map((url, idx) =>
                  <img key={idx} src={url} alt="Preview" className="w-24 h-20 object-cover rounded border" />
                )}
              </div>
            }
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {villaPhotos && villaPhotos.map(photo =>
                <div key={photo.photo_id} className="relative group">
                  <img src={photo.url} alt="Villa Photo" className="w-full h-32 object-cover rounded shadow" />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.photo_id)}
                    className="absolute top-2 right-2 bg-white bg-opacity-80 rounded-full p-1 hover:bg-red-100 transition"
                    aria-label="Remove photo"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Remove</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <div className="absolute left-2 bottom-2 bg-gray-900 text-white text-xs px-2 py-0.5 rounded opacity-70">{photo.sort_order}</div>
                </div>
              )}
            </div>
            {!villaPhotos?.length && (
              <span className="block mt-4 text-gray-500">No photos uploaded yet.</span>
            )}
          </div>
        )}

        {activeTab === "amenities" && (
          <div>
            <div className="mb-3 text-gray-600">Select amenities for your villa:</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {amenities?.map(am => (
                <label key={am.slug} className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 cursor-pointer" tabIndex={0}>
                  <input
                    type="checkbox"
                    checked={selectedAmenities.includes(am.slug)}
                    onChange={() => handleAmenityToggle(am.slug)}
                    className="accent-blue-600"
                    aria-label={am.label}
                  />
                  <span>{am.icon_url &&
                    <img src={am.icon_url} alt="" className="inline-block w-5 h-5 mr-1" />
                  }{am.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 text-sm text-gray-500">You may update amenities at any time. New amenities will appear to guests instantly.</div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div>
            <div className="mb-2 text-gray-700">
              Block or unblock dates for maintenance or personal use.
            </div>
            <div className="flex gap-2 items-end mb-4">
              <label>
                <span className="block font-semibold mb-1">Date</span>
                <input
                  type="date"
                  className="border px-2 py-1 rounded"
                  value={calendarDateInput}
                  onChange={e => { setCalendarDateInput(e.target.value); setError(null); }}
                />
              </label>
              <label>
                <span className="block font-semibold mb-1">Type</span>
                <select
                  className="border px-2 py-1 rounded"
                  value={calendarBlockType}
                  onChange={e => setCalendarBlockType(e.target.value as "block"|"unblock")}
                >
                  <option value="block">Block (Not Available)</option>
                  <option value="unblock">Unblock (Available)</option>
                </select>
              </label>
              <button
                type="button"
                className="px-4 py-1 bg-blue-700 text-white rounded font-semibold mt-4"
                onClick={() => {
                  if (!calendarDateInput) {
                    setError("Please select a date.");
                    return;
                  }
                  setAvailabilityMut.mutate({
                    date: calendarDateInput,
                    is_available: calendarBlockType === "unblock",
                    is_blocked: calendarBlockType === "block",
                  });
                }}
                disabled={isAnyLoading || !calendarDateInput}
                aria-label="Block or unblock date"
              >Set</button>
            </div>
            <div>
              <h3 className="font-bold text-md mt-6 mb-2">Calendar Entries</h3>
              <div className="overflow-x-auto">
                <table className="w-full table-auto border">
                  <thead>
                    <tr className="bg-gray-200 text-sm">
                      <th className="px-2 py-1">Date</th>
                      <th>Status</th>
                      <th>Blocked?</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {availabilities && availabilities.length > 0 ?
                      availabilities.map(a =>
                        <tr key={a.availability_id} className={`text-sm ${a.is_available ? "" : "opacity-60"}`}>
                          <td className="px-2 py-1">{a.date}</td>
                          <td>{a.is_available ? "Available" : "Unavailable"}</td>
                          <td>{a.is_blocked ? "Yes" : "No"}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => deleteAvailMut.mutate(a.availability_id)}
                              className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded hover:bg-red-200"
                              aria-label="Remove block/unblock date"
                            >Remove</button>
                          </td>
                        </tr>
                      ) :
                      <tr>
                        <td colSpan={4} className="text-center text-gray-400">No calendar overrides yet.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "pricing_rules" && (
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="font-semibold block mb-1">
                  Price per Night<span className="text-red-500">*</span>
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    min={0}
                    step="1"
                    value={form.price_per_night ?? ""}
                    onChange={e => updateForm({ price_per_night: Number(e.target.value) })}
                    required
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Cleaning Fee
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    min={0}
                    step="1"
                    value={form.cleaning_fee ?? ""}
                    onChange={e => updateForm({ cleaning_fee: Number(e.target.value) })}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Service Fee
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    min={0}
                    step="1"
                    value={form.service_fee ?? ""}
                    onChange={e => updateForm({ service_fee: Number(e.target.value) })}
                  />
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Min. Stay Nights
                  <input
                    className="block w-full mt-1 p-2 border rounded"
                    type="number"
                    min={1}
                    max={30}
                    value={form.minimum_stay_nights ?? ""}
                    onChange={e => updateForm({ minimum_stay_nights: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div>
                <label className="font-semibold block mb-1">
                  Cancellation Policy<span className="text-red-500">*</span>
                  <select
                    className="block w-full mt-1 p-2 border rounded"
                    value={form.cancellation_policy || ""}
                    onChange={e => updateForm({ cancellation_policy: e.target.value })}
                    required
                  >
                    <option value="">Select...</option>
                    {cancellationPolicies.map(opt =>
                      <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                    )}
                  </select>
                </label>
                <label className="font-semibold block mt-4 mb-1">
                  Status
                  <select
                    className="block w-full mt-1 p-2 border rounded"
                    value={form.status || "published"}
                    onChange={e => updateForm({ status: e.target.value })}
                  >
                    {statusOptions.map(s =>
                      <option key={s.value} value={s.value}>{s.label}</option>
                    )}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800"
                disabled={isAnyLoading}
                aria-label="Save Pricing & Rules"
              >Save</button>
              <Link to="/dashboard/host" className="px-5 py-2 border border-gray-400 rounded bg-gray-50 hover:bg-gray-100" tabIndex={0}>
                Cancel
              </Link>
            </div>
          </form>
        )}

        {/* Loader overlay (tab-local) */}
        {isAnyLoading && (
          <div className="fixed inset-0 bg-white bg-opacity-60 flex items-center justify-center z-50">
            <div className="flex flex-col gap-3 items-center">
              <svg className="animate-spin h-7 w-7 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <div className="text-blue-700">Loading...</div>
            </div>
          </div>
        )}
      </div>
      {/* Back link */}
      <div className="max-w-4xl mx-auto px-2 mt-8 mb-16">
        <Link to="/dashboard/host" className="text-blue-600 hover:underline text-sm" tabIndex={0}>
          &larr; Back to Host Dashboard
        </Link>
      </div>
    </>
  );
};

export default UV_HostEditListing;
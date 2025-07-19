import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import {
  CreateVillaInput,
  Villa,
  Amenity,
} from "@schema";
import { useAppStore } from "@/store/main";

// ---- Type helpers for this view ----
interface NewPhoto {
  url: string;
  fileObj?: File; // For local uploads, not used in backend
  sort_order: number;
  isUploaded?: boolean;
  error?: string | null;
}

// Helper: generate an array of dates between two date strings (inclusive)
function getDateRange(start: string, end: string): string[] {
  const result: string[] = [];
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    result.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return result;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ---- Main Component ----
const UV_HostAddListing: React.FC = () => {
  // Global state
  const user = useAppStore(s => s.user);
  const set_loader_state = useAppStore(s => s.set_loader_state);
  const reset_loader_state = useAppStore(s => s.reset_loader_state);
  const set_error_state = useAppStore(s => s.set_error_state);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ----- Steps: 0-6 -----
  type WizardStep =
    | 0 // Basic info
    | 1 // Photos
    | 2 // Amenities
    | 3 // Description/Rules/Notes
    | 4 // Availability
    | 5 // Pricing
    | 6 // Review/Publish
    ;
  const [step, setStep] = useState<WizardStep>(0);

  // ----- Local state for all fields, progressively updated -----
  const [basicInfo, setBasicInfo] = useState({
    name: "",
    subtitle: "",
    location: "",
    lat: "",
    lng: "",
  });
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [amenitiesChecked, setAmenitiesChecked] = useState<string[]>([]);
  const [descInfo, setDescInfo] = useState({
    description: "",
    house_rules: "",
    special_notes: "",
  });
  const [pricing, setPricing] = useState({
    price_per_night: "",
    cleaning_fee: "",
    service_fee: "",
    minimum_stay_nights: "1",
    cancellation_policy: "flexible",
  });
  const [availability, setAvailability] = useState<{ unavailable: string[] }>({ unavailable: [] });

  // Control: submission state, errors, villa id after creation, amenity data
  const [villaId, setVillaId] = useState<string | null>(null);
  const [villaCreated, setVillaCreated] = useState<boolean>(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Refs for file input to trigger click programmatically
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- Fetch amenity list from backend -----
  const amenityQuery = useQuery<Amenity[], Error>({
    queryKey: ["amenities"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/amenities`);
      return res.data;
    },
  });

  // ---- Wizard Step Titles & Progress ----
  const stepTitles = [
    "Basic Info",
    "Photos",
    "Amenities",
    "Description & Rules",
    "Availability",
    "Pricing",
    "Review & Publish",
  ];

  // ---- Validation per step ----
  const validateStep = async (curStep: WizardStep): Promise<boolean> => {
    setStepError(null);
    switch (curStep) {
      case 0:
        // Name, location, lat/lng required, property type fixed
        if (!basicInfo.name.trim()) {
          setStepError("Listing name is required.");
          return false;
        }
        if (!basicInfo.location.trim()) {
          setStepError("Location is required.");
          return false;
        }
        if (
          !basicInfo.lat ||
          !basicInfo.lng ||
          isNaN(Number(basicInfo.lat)) ||
          isNaN(Number(basicInfo.lng))
        ) {
          setStepError("Latitude and Longitude (numeric) are required.");
          return false;
        }
        return true;
      case 1:
        if (photos.length < 5) {
          setStepError("Please add at least 5 photos.");
          return false;
        }
        if (photos.length > 20) {
          setStepError("No more than 20 photos allowed.");
          return false;
        }
        if (photos.some(p => !p.url || !/^https?:\/\//.test(p.url))) {
          setStepError("Every photo must have a valid image URL.");
          return false;
        }
        return true;
      case 2:
        if (amenitiesChecked.length === 0) {
          setStepError("Please select at least one amenity.");
          return false;
        }
        return true;
      case 3:
        if (!descInfo.description.trim()) {
          setStepError("Description is required.");
          return false;
        }
        return true;
      case 4:
        // Allow empty—availability can be changed later, but block going forward if unavailable covers all days in next 365 days
        // For demo, let proceed if < 365 unavailable
        return true;
      case 5:
        if (!pricing.price_per_night || isNaN(Number(pricing.price_per_night))) {
          setStepError("Nightly rate is required and must be numeric.");
          return false;
        }
        if (
          pricing.cleaning_fee &&
          isNaN(Number(pricing.cleaning_fee))
        ) {
          setStepError("Cleaning fee must be numeric.");
          return false;
        }
        if (
          pricing.service_fee &&
          isNaN(Number(pricing.service_fee))
        ) {
          setStepError("Service fee must be numeric.");
          return false;
        }
        if (
          !pricing.minimum_stay_nights ||
          isNaN(Number(pricing.minimum_stay_nights)) ||
          Number(pricing.minimum_stay_nights) < 1
        ) {
          setStepError("Minimum stay must be a positive integer.");
          return false;
        }
        if (
          !["flexible", "moderate", "strict"].includes(pricing.cancellation_policy)
        ) {
          setStepError("Please pick a valid cancellation policy.");
          return false;
        }
        return true;
      case 6:
        // Final review—make sure villaId as proof all previous steps have passed
        if (!villaId) {
          setStepError("Something went wrong; villa not created yet.");
          return false;
        }
        return true;
      default:
        return false;
    }
  };

  // ----- Mutations -----
  // Villa creation
  const createVillaMutation = useMutation<Villa, Error, CreateVillaInput>({
    mutationFn: async (data) => {
      const res = await axios.post(`${API_BASE}/villas`, data, {
        headers: {
          Authorization: useAppStore.getState().auth_token
            ? `Bearer ${useAppStore.getState().auth_token}`
            : undefined,
        },
      });
      return res.data;
    },
  });

  // Photo upload (one by one)
  const uploadPhotoMutation = useMutation<any, Error, { villa_id: string, url: string, sort_order: number }>({
    mutationFn: async ({ villa_id, url, sort_order }) => {
      const res = await axios.post(`${API_BASE}/villas/${villa_id}/photos`, {
        villa_id,
        url,
        sort_order,
      }, {
        headers: {
          Authorization: useAppStore.getState().auth_token
            ? `Bearer ${useAppStore.getState().auth_token}`
            : undefined,
        },
      });
      return res.data;
    },
  });

  // Villa amenity assignment (one by one)
  const addAmenityMutation = useMutation<any, Error, { villa_id: string; amenity_slug: string }>({
    mutationFn: async ({ villa_id, amenity_slug }) => {
      const res = await axios.post(`${API_BASE}/villa-amenities`, { villa_id, amenity_slug }, {
        headers: {
          Authorization: useAppStore.getState().auth_token
            ? `Bearer ${useAppStore.getState().auth_token}`
            : undefined,
        },
      });
      return res.data;
    },
  });

  // Set date as available/unavailable (per entry)
  const setDayAvailabilityMutation = useMutation<any, Error, { villa_id: string; date: string; is_available: boolean; is_blocked?: boolean }>({
    mutationFn: async ({ villa_id, date, is_available, is_blocked = false }) => {
      const res = await axios.post(`${API_BASE}/villas/${villa_id}/availability`, {
        villa_id, date, is_available, is_blocked,
      }, {
        headers: {
          Authorization: useAppStore.getState().auth_token
            ? `Bearer ${useAppStore.getState().auth_token}`
            : undefined,
        },
      });
      return res.data;
    },
  });

  // -------------- Main step handler --------------
  const handleNext = async () => {
    // Validate before advance
    if (!(await validateStep(step))) return;

    // Step 0: Basic Info, do villa creation if not already done!
    if (step === 0 && !villaId) {
      set_loader_state({ is_loading: true, context: "Creating listing..." });
      // Compose CreateVillaInput
      const payload: CreateVillaInput = {
        host_user_id: user!.user_id,
        name: basicInfo.name,
        subtitle: basicInfo.subtitle || undefined,
        location: basicInfo.location,
        lat: Number(basicInfo.lat),
        lng: Number(basicInfo.lng),
        description: "", // initially, required later, patch in desc step
        amenities: "placeholder", // at start, gets patched after
        price_per_night: 100, // placeholder, patch after
        cleaning_fee: 0,
        service_fee: 0,
        cancellation_policy: "flexible",
        status: "draft",
      };

      try {
        const villa = await createVillaMutation.mutateAsync(payload);
        setVillaId(villa.villa_id);
        setVillaCreated(true);
        set_loader_state({ is_loading: false, context: null });
        setStepError(null);
        setStep(step + 1 as WizardStep);
      } catch (err: any) {
        set_loader_state({ is_loading: false, context: null });
        setStepError("Failed to create villa: " + (err?.response?.data?.error || err?.message || "Unknown error"));
        set_error_state({ message: "Failed to create villa. " + (err?.response?.data?.error || err?.message || "Unknown error") });
      }
      return;
    }

    // Step 1: Photos: must have villa_id, upload all at once
    if (step === 1 && villaId) {
      set_loader_state({ is_loading: true, context: "Uploading photos..." });
      let failed = false;
      for (const [i, photo] of photos.entries()) {
        try {
          await uploadPhotoMutation.mutateAsync({
            villa_id: villaId,
            url: photo.url,
            sort_order: i,
          });
        } catch (err: any) {
          failed = true;
          setStepError("Photo upload failed: " + (err?.response?.data?.error || err?.message));
          set_error_state({ message: "Photo upload failed: " + (err?.response?.data?.error || err?.message) });
        }
      }
      set_loader_state({ is_loading: false, context: null });
      if (failed) return;
      setStepError(null);
      setStep(step + 1 as WizardStep);
      return;
    }

    // Step 2: Amenities: POST each amenity (+ clear any existing if user goes back/forward: but here only add, as villa is new)
    if (step === 2 && villaId) {
      set_loader_state({ is_loading: true, context: "Setting amenities..." });
      for (const amenity_slug of amenitiesChecked) {
        try {
          await addAmenityMutation.mutateAsync({ villa_id: villaId, amenity_slug });
        } catch (err: any) {
          setStepError("Failed to assign amenities: " + (err?.response?.data?.error || err?.message));
          set_error_state({ message: "Failed to assign amenities. " + (err?.response?.data?.error || err?.message) });
          set_loader_state({ is_loading: false, context: null });
          return;
        }
      }
      set_loader_state({ is_loading: false, context: null });
      setStepError(null);
      setStep(step + 1 as WizardStep);
      return;
    }
    // Step 3: Description/Rules/Notes: PATCH villa
    if (step === 3 && villaId) {
      set_loader_state({ is_loading: true, context: "Saving description..." });
      try {
        await axios.patch(`${API_BASE}/villas/${villaId}`, {
          villa_id: villaId,
          description: descInfo.description,
          house_rules: descInfo.house_rules,
          special_notes: descInfo.special_notes,
        }, {
          headers: {
            Authorization: useAppStore.getState().auth_token
              ? `Bearer ${useAppStore.getState().auth_token}`
              : undefined,
          },
        });
        set_loader_state({ is_loading: false, context: null });
        setStepError(null);
        setStep(step + 1 as WizardStep);
      } catch (err: any) {
        setStepError("Failed to save description: " + (err?.response?.data?.error || err?.message));
        set_error_state({ message: "Failed to save description. " + (err?.response?.data?.error || err?.message) });
        set_loader_state({ is_loading: false, context: null });
      }
      return;
    }
    // Step 4: Availability: user can optionally block out dates, each POST individually
    if (step === 4 && villaId && availability.unavailable.length > 0) {
      set_loader_state({ is_loading: true, context: "Setting availability..." });
      for (const date of availability.unavailable) {
        try {
          await setDayAvailabilityMutation.mutateAsync({
            villa_id: villaId,
            date: date,
            is_available: false,
          });
        } catch (err: any) {
          setStepError("Failed to block out dates: " + (err?.response?.data?.error || err?.message));
          set_error_state({ message: "Failed to block dates. " + (err?.response?.data?.error || err?.message) });
          set_loader_state({ is_loading: false, context: null });
          return;
        }
      }
      set_loader_state({ is_loading: false, context: null });
      setStepError(null);
      setStep(step + 1 as WizardStep);
      return;
    }
    // Step 5: Pricing/Policy: PATCH villa
    if (step === 5 && villaId) {
      set_loader_state({ is_loading: true, context: "Saving pricing..." });
      try {
        await axios.patch(`${API_BASE}/villas/${villaId}`, {
          villa_id: villaId,
          price_per_night: Number(pricing.price_per_night),
          cleaning_fee: Number(pricing.cleaning_fee) || 0,
          service_fee: Number(pricing.service_fee) || 0,
          minimum_stay_nights: Number(pricing.minimum_stay_nights),
          cancellation_policy: pricing.cancellation_policy,
          amenities: amenitiesChecked.join(","),
        }, {
          headers: {
            Authorization: useAppStore.getState().auth_token
              ? `Bearer ${useAppStore.getState().auth_token}`
              : undefined,
          },
        });
        set_loader_state({ is_loading: false, context: null });
        setStepError(null);
        setStep(step + 1 as WizardStep);
      } catch (err: any) {
        setStepError("Failed to save pricing: " + (err?.response?.data?.error || err?.message));
        set_error_state({ message: "Failed to save pricing. " + (err?.response?.data?.error || err?.message) });
        set_loader_state({ is_loading: false, context: null });
      }
      return;
    }

    // Step 6: Review & Publish (final): PATCH villa status to "published"
    if (step === 6 && villaId) {
      setPublishLoading(true);
      set_loader_state({ is_loading: true, context: "Publishing listing..." });
      try {
        await axios.patch(`${API_BASE}/villas/${villaId}`, {
          villa_id: villaId,
          status: "published",
        }, {
          headers: {
            Authorization: useAppStore.getState().auth_token
              ? `Bearer ${useAppStore.getState().auth_token}`
              : undefined,
          },
        });
        setPublishLoading(false);
        set_loader_state({ is_loading: false, context: null });
        // Invalidate dashboard and search
        queryClient.invalidateQueries({ queryKey: ["villas"] });
        navigate("/dashboard/host");
      } catch (err: any) {
        setPublishLoading(false);
        set_loader_state({ is_loading: false, context: null });
        setStepError("Failed to publish: " + (err?.response?.data?.error || err?.message));
        set_error_state({ message: "Failed to publish. " + (err?.response?.data?.error || err?.message) });
      }
      return;
    }

    // Default: go next step
    setStepError(null);
    setStep(step + 1 as WizardStep);
  };

  // Go back
  const handlePrev = () => {
    setStepError(null);
    if (step > 0) setStep(step - 1 as WizardStep);
  };

  // -------- Save as draft at any step: PATCH villa, set status='draft'
  const handleSaveAsDraft = async () => {
    if (!villaId) {
      setStepError("Can't save as draft before villa is started.");
      return;
    }
    setSaveDraftLoading(true);
    set_loader_state({ is_loading: true, context: "Saving draft..." });
    try {
      await axios.patch(`${API_BASE}/villas/${villaId}`, {
        villa_id: villaId,
        status: "draft",
      }, {
        headers: {
          Authorization: useAppStore.getState().auth_token
            ? `Bearer ${useAppStore.getState().auth_token}`
            : undefined,
        },
      });
      setSaveDraftLoading(false);
      set_loader_state({ is_loading: false, context: null });
      navigate("/dashboard/host");
    } catch (err: any) {
      setSaveDraftLoading(false);
      set_loader_state({ is_loading: false, context: null });
      set_error_state({ message: "Failed to save draft: " + (err?.response?.data?.error || err?.message) });
    }
  };

  // ------------- Photo file/dummy image picker -------------
  const handleAddPhotos = (files: FileList | null) => {
    if (!files) return;
    let newPhotos: NewPhoto[] = [];
    for (let i = 0; i < files.length && photos.length + newPhotos.length < 20; ++i) {
      const file = files[i];
      // For dev/demo, simulate with a random picsum.photos url seeded by name
      const seed = encodeURIComponent(file.name + Date.now());
      const url = `https://picsum.photos/seed/${seed}/800/600?random=1`;
      newPhotos.push({ url, fileObj: file, sort_order: photos.length + newPhotos.length });
    }
    setPhotos(prev => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---- Remove photo
  const handleRemovePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // ---- Drag & drop reordering ----
  const handlePhotoMove = (idx: number, dir: -1 | 1) => {
    setPhotos(prev => {
      if (
        (dir == -1 && idx === 0) ||
        (dir === 1 && idx === prev.length - 1)
      )
        return prev;
      const arr = [...prev];
      const [removed] = arr.splice(idx, 1);
      arr.splice(idx + dir, 0, removed);
      return arr.map((p, i) => ({ ...p, sort_order: i }));
    });
  };

  // ----------------- Availability calendar UI helpers -----------------------
  // Basic next-6-weeks render; select blocks. Only simple calendar here!
  const today = new Date();
  const calWeeks: string[][] = [];
  for (let wk = 0; wk < 6; ++wk) {
    const week: string[] = [];
    for (let d = 0; d < 7; ++d) {
      const dT = new Date(today.getTime());
      dT.setDate(today.getDate() + wk * 7 + d);
      week.push(dT.toISOString().slice(0, 10));
    }
    calWeeks.push(week);
  }

  // ---- Toggle unavailability for a given date
  const handleToggleUnavailable = (date: string) => {
    setAvailability(avail => {
      const isBlocked = avail.unavailable.includes(date);
      if (isBlocked) {
        return { unavailable: avail.unavailable.filter(d => d !== date) };
      } else {
        return { unavailable: [...avail.unavailable, date] };
      }
    });
  };

  // ---- Step disabled: availability only after villa created
  const canEditCalendar = !!villaId;

  // ----------------------------- UI Render -----------------------------
  // Error boundary
  try {
    return (
      <>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-semibold mb-4">Add New Villa Listing</h1>
          {/* Progress bar & step tracker */}
          <div className="flex items-center mb-8">
            {stepTitles.map((title, i) => (
              <div
                key={i}
                className={`flex-1 flex flex-col items-center relative ${i < step ? "text-green-600" : i === step ? "text-blue-800 font-bold" : "text-gray-400"} `}
              >
                <div className={`rounded-full w-8 h-8 flex items-center justify-center text-lg border-2 mb-1 border-current bg-white`}>
                  {i + 1}
                </div>
                <div className="text-xs text-center">{title}</div>
                {i < stepTitles.length - 1 && (
                  <div className={`absolute top-4 right-0 w-1/2 h-1 ${i < step ? "bg-green-600" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step error message */}
          {stepError && (
            <div className="mb-4 text-red-600 text-sm" aria-live="polite">
              {stepError}
            </div>
          )}

          {/* STEP CONTENT - big single block */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleNext();
            }}
            autoComplete="off"
            spellCheck={false}
          >
            {/* Step 0: Basic Info */}
            {step === 0 && (
              <div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="name">
                    Listing Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={basicInfo.name}
                    onChange={e => {
                      setStepError(null);
                      setBasicInfo(b => ({ ...b, name: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="subtitle">
                    Short Caption
                  </label>
                  <input
                    id="subtitle"
                    name="subtitle"
                    type="text"
                    value={basicInfo.subtitle}
                    onChange={e => {
                      setStepError(null);
                      setBasicInfo(b => ({ ...b, subtitle: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    maxLength={255}
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="location">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    value={basicInfo.location}
                    onChange={e => {
                      setStepError(null);
                      setBasicInfo(b => ({ ...b, location: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="mb-5 flex gap-4">
                  <div className="flex-1">
                    <label className="block font-medium mb-1" htmlFor="lat">
                      Latitude <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lat"
                      name="lat"
                      type="number"
                      value={basicInfo.lat}
                      onChange={e => {
                        setStepError(null);
                        setBasicInfo(b => ({ ...b, lat: e.target.value }));
                      }}
                      className="w-full border-gray-300 rounded px-3 py-2"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block font-medium mb-1" htmlFor="lng">
                      Longitude <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lng"
                      name="lng"
                      type="number"
                      value={basicInfo.lng}
                      onChange={e => {
                        setStepError(null);
                        setBasicInfo(b => ({ ...b, lng: e.target.value }));
                      }}
                      className="w-full border-gray-300 rounded px-3 py-2"
                      required
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block font-medium">
                    Property Type
                  </label>
                  <div className="font-semibold text-blue-700 mt-1">
                    Cliff-side Beach House Villa
                  </div>
                  <div className="text-sm text-slate-500">
                    (Type is fixed for CliffBnb)
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Photos */}
            {step === 1 && (
              <div>
                <div className="mb-3">
                  <label className="block font-medium mb-1">
                    Upload Photos <span className="text-red-500">*</span>
                  </label>
                  <div
                    className="border-2 border-dashed rounded p-4 bg-slate-50 mb-2 flex flex-wrap gap-3 min-h-[100px]"
                    onClick={() => fileInputRef.current?.click()}
                    tabIndex={0}
                    role="button"
                    aria-label="Add photos"
                  >
                    {photos.length === 0 && (
                      <div className="text-sm text-gray-500 py-10 w-full text-center">
                        Drag, or click here to add photos. (Only 5-20 images allowed)
                      </div>
                    )}
                    {photos.map((photo, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={photo.url}
                          alt={`photo ${i + 1}`}
                          className="w-32 h-24 object-cover rounded shadow border"
                        />
                        <button
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-80"
                          aria-label="Remove photo"
                          type="button"
                          tabIndex={0}
                          onClick={e => {
                            e.stopPropagation();
                            handleRemovePhoto(i);
                          }}
                        >
                          ×
                        </button>
                        {/* Drag arrows */}
                        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
                          <button
                            type="button"
                            tabIndex={0}
                            aria-label="Move left"
                            className={`text-white ${i === 0 ? "opacity-20 pointer-events-none" : "opacity-80"} bg-blue-600/80 rounded-full w-6 h-6 flex items-center justify-center`}
                            onClick={e => { e.stopPropagation(); handlePhotoMove(i, -1); }}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            tabIndex={0}
                            aria-label="Move right"
                            className={`text-white ${i === photos.length - 1 ? "opacity-20 pointer-events-none" : "opacity-80"} bg-blue-600/80 rounded-full w-6 h-6 flex items-center justify-center`}
                            onClick={e => { e.stopPropagation(); handlePhotoMove(i, 1); }}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handleAddPhotos(e.target.files)}
                  />
                  <div className="text-sm text-slate-500">
                    Total: {photos.length} selected
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Amenities */}
            {step === 2 && (
              <div>
                <div className="mb-3">
                  <label className="block font-medium mb-1">
                    Select Amenities <span className="text-red-500">*</span>
                  </label>
                  {amenityQuery.isLoading ? (
                    <div>Loading amenities...</div>
                  ) : amenityQuery.isError ? (
                    <div className="text-red-600">Failed to load amenities.</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {amenityQuery.data?.map(am => (
                        <label key={am.slug} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={amenitiesChecked.includes(am.slug)}
                            onChange={e => {
                              setStepError(null);
                              setAmenitiesChecked(list =>
                                e.target.checked
                                  ? [...list, am.slug]
                                  : list.filter(a => a !== am.slug)
                              );
                            }}
                          />
                          {am.icon_url ? (
                            <img src={am.icon_url} alt={am.label} className="w-5 h-5 rounded" />
                          ) : (
                            <div className="w-5 h-5 rounded bg-slate-200" />
                          )}
                          <span className="text-slate-700 text-sm">{am.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Description, House Rules, Notes */}
            {step === 3 && (
              <div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="description">
                    Listing Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={5}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    value={descInfo.description}
                    onChange={e => {
                      setStepError(null);
                      setDescInfo(info => ({ ...info, description: e.target.value }));
                    }}
                    required
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="house_rules">
                    House Rules
                  </label>
                  <textarea
                    id="house_rules"
                    name="house_rules"
                    rows={3}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    value={descInfo.house_rules}
                    onChange={e => {
                      setStepError(null);
                      setDescInfo(info => ({ ...info, house_rules: e.target.value }));
                    }}
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="special_notes">
                    Special Notes
                  </label>
                  <textarea
                    id="special_notes"
                    name="special_notes"
                    rows={3}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    value={descInfo.special_notes}
                    onChange={e => {
                      setStepError(null);
                      setDescInfo(info => ({ ...info, special_notes: e.target.value }));
                    }}
                  />
                </div>
              </div>
            )}

            {/* Step 4: Availability */}
            {step === 4 && (
              <div>
                <div className="mb-3">
                  <label className="block font-medium mb-1">Block/Unblock Unavailable Dates</label>
                  <div className="text-sm text-slate-600 mb-2">
                    Click on a date to mark it as unavailable (blocked for booking). By default, all dates are available.
                  </div>
                  {!canEditCalendar ? (
                    <div className="text-xs text-slate-400">
                      * You can set availability after villa is created (after Steps 1-3).
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {calWeeks.map((week, wi) => (
                        <React.Fragment key={wi}>
                          {week.map(date => (
                            <button
                              key={date}
                              type="button"
                              tabIndex={0}
                              onClick={() => handleToggleUnavailable(date)}
                              className={`rounded border w-9 h-9 text-xs focus:outline-none
                                ${availability.unavailable.includes(date)
                                  ? "bg-red-500 text-white border-red-600"
                                  : "bg-white text-gray-900 border-gray-300 hover:bg-blue-200"
                                }
                              `}
                              aria-label={`${availability.unavailable.includes(date) ? "Blocked" : "Available"}: ${date}`}
                            >
                              {date.slice(-2)}
                            </button>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Blocked: {availability.unavailable.length} date{availability.unavailable.length !== 1 ? "s" : ""}
                </div>
              </div>
            )}

            {/* Step 5: Pricing */}
            {step === 5 && (
              <div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="price_per_night">
                    Nightly Rate (in USD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="price_per_night"
                    name="price_per_night"
                    type="number"
                    step="1"
                    value={pricing.price_per_night}
                    onChange={e => {
                      setStepError(null);
                      setPricing(p => ({ ...p, price_per_night: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="cleaning_fee">
                    Cleaning Fee (USD, optional)
                  </label>
                  <input
                    id="cleaning_fee"
                    name="cleaning_fee"
                    type="number"
                    step="1"
                    value={pricing.cleaning_fee}
                    onChange={e => {
                      setStepError(null);
                      setPricing(p => ({ ...p, cleaning_fee: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="service_fee">
                    Service Fee (USD, optional)
                  </label>
                  <input
                    id="service_fee"
                    name="service_fee"
                    type="number"
                    step="1"
                    value={pricing.service_fee}
                    onChange={e => {
                      setStepError(null);
                      setPricing(p => ({ ...p, service_fee: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="minimum_stay_nights">
                    Minimum Stay Nights <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="minimum_stay_nights"
                    name="minimum_stay_nights"
                    type="number"
                    step="1"
                    min="1"
                    value={pricing.minimum_stay_nights}
                    onChange={e => {
                      setStepError(null);
                      setPricing(p => ({ ...p, minimum_stay_nights: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-5">
                  <label className="block font-medium mb-1" htmlFor="cancellation_policy">
                    Cancellation Policy <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="cancellation_policy"
                    name="cancellation_policy"
                    value={pricing.cancellation_policy}
                    onChange={e => {
                      setStepError(null);
                      setPricing(p => ({ ...p, cancellation_policy: e.target.value }));
                    }}
                    className="w-full border-gray-300 rounded px-3 py-2"
                    required
                  >
                    <option value="flexible">Flexible</option>
                    <option value="moderate">Moderate</option>
                    <option value="strict">Strict</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 6: Review & Publish */}
            {step === 6 && (
              <div>
                <div className="mb-4 p-4 border rounded bg-slate-50">
                  <h2 className="text-xl font-semibold mb-2">Here's a summary—please confirm:</h2>
                  <div className="space-y-2">
                    <div>
                      <span className="font-semibold">Name:</span> {basicInfo.name}
                    </div>
                    <div>
                      <span className="font-semibold">Subtitle:</span> {basicInfo.subtitle}
                    </div>
                    <div>
                      <span className="font-semibold">Location:</span> {basicInfo.location}
                    </div>
                    <div>
                      <span className="font-semibold">Coordinates:</span> {basicInfo.lat}, {basicInfo.lng}
                    </div>
                    <div>
                      <span className="font-semibold">Photos:</span>
                      <div className="flex gap-2 mt-1">
                        {photos.map((p, i) => (
                          <img key={i} src={p.url} alt={`Villa photo preview ${i + 1}`} className="w-14 h-10 rounded object-cover border" />
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold">Amenities:</span> {amenitiesChecked.map(slug => {
                        const a = amenityQuery.data?.find(a => a.slug === slug);
                        return a?.label || slug;
                      }).join(", ")}
                    </div>
                    <div>
                      <span className="font-semibold">Description:</span> {descInfo.description}
                    </div>
                    <div>
                      <span className="font-semibold">House Rules:</span> {descInfo.house_rules}
                    </div>
                    <div>
                      <span className="font-semibold">Special Notes:</span> {descInfo.special_notes}
                    </div>
                    <div>
                      <span className="font-semibold">Blocked Dates:</span> {availability.unavailable.length} date{availability.unavailable.length !== 1 ? "s" : ""}
                    </div>
                    <div>
                      <span className="font-semibold">Nightly Rate:</span> ${pricing.price_per_night}
                    </div>
                    <div>
                      <span className="font-semibold">Cleaning Fee:</span> ${pricing.cleaning_fee || 0}
                    </div>
                    <div>
                      <span className="font-semibold">Service Fee:</span> ${pricing.service_fee || 0}
                    </div>
                    <div>
                      <span className="font-semibold">Min Stay:</span> {pricing.minimum_stay_nights} night(s)
                    </div>
                    <div>
                      <span className="font-semibold">Cancel Policy:</span> {pricing.cancellation_policy}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Once published, your listing will be visible to guests searching for cliff villas!
                </div>
              </div>
            )}

            {/* Step navigation buttons */}
            <div className="flex items-center justify-between mt-6 gap-4">
              {(step > 0) && (
                <button
                  type="button"
                  tabIndex={0}
                  className="px-4 py-2 rounded border text-gray-800 bg-gray-100 hover:bg-gray-200"
                  onClick={handlePrev}
                >
                  Back
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                tabIndex={0}
                className="px-4 py-2 rounded border border-blue-500 bg-white text-blue-700 hover:bg-blue-50"
                onClick={handleSaveAsDraft}
                disabled={saveDraftLoading || !villaId}
              >
                {saveDraftLoading ? "Saving..." : "Save as Draft"}
              </button>
              <button
                type="submit"
                tabIndex={0}
                className={`ml-2 px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 transition ${
                  publishLoading ? "opacity-60 pointer-events-none" : ""
                }`}
                aria-label={step === 6 ? "Publish Listing" : "Next"}
              >
                {step === 6 ? (publishLoading ? "Publishing..." : "Publish") : "Next"}
              </button>
            </div>
            {/* Link to dashboard */}
            <div className="mt-4 text-center text-sm">
              <Link to="/dashboard/host" className="text-blue-700 underline">
                Cancel and return to Host Dashboard
              </Link>
            </div>
          </form>
        </div>
      </>
    );
  } catch (err) {
    // Error Boundary fallback
    return (
      <div className="flex flex-col items-center py-20">
        <div className="text-red-700 text-xl font-bold mb-2">
          Something went wrong!
        </div>
        <div className="mb-4 text-slate-600">
          {err instanceof Error ? err.message : String(err)}
        </div>
        <Link className="text-blue-700 underline" to="/dashboard/host">
          Go back to Host Dashboard
        </Link>
      </div>
    );
  }
};

export default UV_HostAddListing;

import json, random, shutil
from pathlib import Path

CYLINDER_ROOT = Path(r"C:\Users\jsh14\Desktop\s\cylinder_pose_labeling")
SOURCE_DIRS = [CYLINDER_ROOT / "full", CYLINDER_ROOT / "crop"]

OLD_DET_DATASET = Path(r"C:\Users\jsh14\Desktop\s\fish_dataset_v2")
OLD_POSE_DATASET = Path(r"C:\Users\jsh14\Desktop\s\fish_pose_dataset_v2")

NEW_DET_DATASET = Path(r"C:\Users\jsh14\Desktop\s\fish_dataset_v3_cylinder")
NEW_POSE_DATASET = Path(r"C:\Users\jsh14\Desktop\s\fish_pose_dataset_v3_cylinder")

VAL_RATIO = 0.20
RANDOM_SEED = 42
BBOX_LABEL = "fish"
KEYPOINT_ORDER = ["head", "dorsal", "tail", "belly"]
IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".bmp", ".webp"]

def clamp01(x):
    return max(0.0, min(1.0, float(x)))

def find_image(json_path, data):
    p = data.get("imagePath")
    if p:
        c = json_path.parent / Path(p).name
        if c.exists():
            return c
    for ext in IMAGE_EXTS:
        c = json_path.with_suffix(ext)
        if c.exists():
            return c
    return None

def rect_from_shape(shape):
    pts = shape.get("points", [])
    if len(pts) < 2:
        return None
    xs = [float(p[0]) for p in pts]
    ys = [float(p[1]) for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

def area(box):
    x1,y1,x2,y2 = box
    return max(0,x2-x1)*max(0,y2-y1)

def extract(data):
    rects, kpts = [], {}
    for s in data.get("shapes", []):
        label = str(s.get("label","")).strip().lower()
        typ = str(s.get("shape_type","")).strip().lower()
        if label == BBOX_LABEL and typ == "rectangle":
            b = rect_from_shape(s)
            if b: rects.append(b)
        elif label in KEYPOINT_ORDER and typ == "point":
            pts = s.get("points", [])
            if pts:
                kpts[label] = (float(pts[0][0]), float(pts[0][1]))
    return (max(rects, key=area) if rects else None), kpts

def det_line(box,w,h):
    x1,y1,x2,y2 = box
    vals = [((x1+x2)/2)/w, ((y1+y2)/2)/h, (x2-x1)/w, (y2-y1)/h]
    return "0 " + " ".join(f"{clamp01(v):.8f}" for v in vals)

def pose_line(box,kpts,w,h):
    if any(k not in kpts for k in KEYPOINT_ORDER):
        return None
    x1,y1,x2,y2 = box
    fields = ["0",
              f"{clamp01(((x1+x2)/2)/w):.8f}",
              f"{clamp01(((y1+y2)/2)/h):.8f}",
              f"{clamp01((x2-x1)/w):.8f}",
              f"{clamp01((y2-y1)/h):.8f}"]
    for k in KEYPOINT_ORDER:
        x,y = kpts[k]
        fields += [f"{clamp01(x/w):.8f}", f"{clamp01(y/h):.8f}", "2"]
    return " ".join(fields)

def ensure_layout(root):
    for split in ("train","val"):
        (root/"images"/split).mkdir(parents=True, exist_ok=True)
        (root/"labels"/split).mkdir(parents=True, exist_ok=True)

def copy_dataset(src,dst):
    if not src.exists():
        raise FileNotFoundError(src)
    if dst.exists():
        raise RuntimeError(f"{dst} already exists. Delete it before rerunning.")
    shutil.copytree(src,dst)
    ensure_layout(dst)

def write_yamls():
    (NEW_DET_DATASET/"data.yaml").write_text(
        f"path: {NEW_DET_DATASET}\ntrain: images/train\nval: images/val\n\nnc: 1\nnames: ['fish']\n",
        encoding="utf-8")
    (NEW_POSE_DATASET/"data.yaml").write_text(
        f"path: {NEW_POSE_DATASET}\ntrain: images/train\nval: images/val\n\nnames:\n  0: fish\n\nkpt_shape: [4, 3]\nflip_idx: [0, 1, 2, 3]\n",
        encoding="utf-8")

def main():
    items=[]
    for src in SOURCE_DIRS:
        if not src.exists():
            continue
        tag=src.name.lower()
        for jp in sorted(src.glob("*.json")):
            data=json.loads(jp.read_text(encoding="utf-8"))
            ip=find_image(jp,data)
            if ip is None:
                print("[SKIP image missing]", jp.name); continue
            w,h=data.get("imageWidth"),data.get("imageHeight")
            if not w or not h:
                from PIL import Image
                with Image.open(ip) as im: w,h=im.size
            box,kpts=extract(data)
            if box is None:
                print("[SKIP fish bbox missing]", jp.name); continue
            items.append(dict(tag=tag, stem=jp.stem, image=ip, w=float(w), h=float(h),
                              box=box, kpts=kpts, json=jp))
    if not items:
        raise RuntimeError("No usable LabelMe annotations found.")

    groups=sorted(set(x["stem"] for x in items))
    rng=random.Random(RANDOM_SEED); rng.shuffle(groups)
    nval=max(1, round(len(groups)*VAL_RATIO))
    valset=set(groups[:nval])

    copy_dataset(OLD_DET_DATASET, NEW_DET_DATASET)
    copy_dataset(OLD_POSE_DATASET, NEW_POSE_DATASET)

    det_count=pose_count=0
    pose_skip=0
    for x in items:
        split="val" if x["stem"] in valset else "train"
        unique=f"cyl_{x['tag']}__{x['stem']}"
        ext=x["image"].suffix.lower() if x["image"].suffix.lower() in IMAGE_EXTS else ".jpg"

        # detection
        shutil.copy2(x["image"], NEW_DET_DATASET/"images"/split/(unique+ext))
        (NEW_DET_DATASET/"labels"/split/(unique+".txt")).write_text(
            det_line(x["box"],x["w"],x["h"])+"\n", encoding="utf-8")
        det_count += 1

        # pose
        pl=pose_line(x["box"],x["kpts"],x["w"],x["h"])
        if pl is None:
            pose_skip += 1
            continue
        shutil.copy2(x["image"], NEW_POSE_DATASET/"images"/split/(unique+ext))
        (NEW_POSE_DATASET/"labels"/split/(unique+".txt")).write_text(pl+"\n",encoding="utf-8")
        pose_count += 1

    write_yamls()
    print(f"LabelMe usable: {len(items)} | independent stems: {len(groups)}")
    print(f"Detection added: {det_count}")
    print(f"Pose added: {pose_count} | Pose skipped(missing H/D/T/B): {pose_skip}")
    print("Detection:", NEW_DET_DATASET/"data.yaml")
    print("Pose:", NEW_POSE_DATASET/"data.yaml")
    print("Original v2 datasets were not modified.")

if __name__ == "__main__":
    main()
